"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  loadAllStaff,
  loadCalendarNotes,
  loadEquipment,
  loadServices,
  loadSettings,
} from "@/lib/data";
import type {
  Appointment,
  AppointmentStep,
  CalendarNote,
  Equipment,
  ServiceWithSteps,
  Settings,
  Staff,
} from "@/lib/types";
import { addDays, minToLabel, toDateStr, WEEKDAY_LABELS } from "@/lib/booking";
import AdminBookingModal from "./AdminBookingModal";

const GUTTER = 44; // 左の時間軸の幅(px)
const SNAP = 30;
const VIEW_START = 360; // 表示レンジ 6:00
const VIEW_END = 1440; //  〜 24:00（出張の早朝発なども入力できる）
const RANGE = VIEW_END - VIEW_START;
const ZOOM_MAX = 5;
const NOTE_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#0ea5e9", "#64748b"];

type ApptWithSteps = Appointment & { steps: AppointmentStep[] };
type Item =
  | { kind: "appt"; s: number; e: number; rank: number; appt: ApptWithSteps }
  | { kind: "note"; s: number; e: number; rank: number; note: CalendarNote };

function layoutLanes(items: Item[]): (Item & { lane: number; cols: number })[] {
  const sorted = [...items].sort((a, b) => a.s - b.s || a.e - b.e);
  const out: (Item & { lane: number; cols: number })[] = [];
  let cluster: Item[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const cl = [...cluster].sort((a, b) => a.rank - b.rank || a.s - b.s);
    const laneEnd: number[] = [];
    const placed = cl.map((it) => {
      let lane = laneEnd.findIndex((end) => end <= it.s);
      if (lane === -1) {
        lane = laneEnd.length;
        laneEnd.push(it.e);
      } else laneEnd[lane] = it.e;
      return { ...it, lane, cols: 1 };
    });
    placed.forEach((p) => (p.cols = laneEnd.length));
    out.push(...placed);
    cluster = [];
  };
  for (const it of sorted) {
    if (cluster.length && it.s >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.e);
  }
  if (cluster.length) flush();
  return out;
}

const snap = (m: number) => Math.round(m / SNAP) * SNAP;

// #rrggbb → 白へ amt(0..1) だけ寄せた薄い色
function lighten(hex: string, amt: number): string {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  if ([r, g, b].some(isNaN)) return hex;
  const mix = (c: number) => Math.round(c + (255 - c) * amt);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

// 工程の色分け：通電＝薄い / 施術＝濃い
function stepTone(st: AppointmentStep): "light" | "dark" {
  if (/通電/.test(st.name)) return "light";
  if (/施術|手技|整体|矯正|マッサージ|検査|カウンセリング/.test(st.name)) return "dark";
  return st.uses_staff ? "dark" : "light";
}

// 予約ブロックを「薄い通電 / 濃い施術」のセグメントへ分解。
// 30分グリッドで区切る：通電20分→30分枠(薄)、施術30分(濃)。60分施術のみ→60分ひとつながり。
type Seg = { s: number; e: number; tone: "light" | "dark" };
function apptSegments(a: ApptWithSteps): Seg[] {
  const blockStart = snap(a.start_min);
  const blockEnd = Math.max(snap(a.end_min), blockStart + SNAP);
  const steps = (a.steps ?? [])
    .filter((st) => st.start_min != null && st.end_min != null)
    .sort((x, y) => x.start_min - y.start_min);
  if (steps.length === 0) return [{ s: blockStart, e: blockEnd, tone: "dark" }];
  // まず工程を色（通電=薄 / 施術=濃）でまとめる
  const merged: Seg[] = [];
  for (const st of steps) {
    const tone = stepTone(st);
    const last = merged[merged.length - 1];
    if (last && last.tone === tone && st.start_min <= last.e) {
      last.e = Math.max(last.e, st.end_min);
    } else {
      merged.push({ s: st.start_min, e: st.end_min, tone });
    }
  }
  // 30分グリッドへスナップし、境界を隙間なく連続させる
  let cursor = blockStart;
  const out: Seg[] = [];
  for (const seg of merged) {
    let end = snap(seg.e);
    if (end <= cursor) end = cursor + SNAP; // 通電20分などは最低30分枠にする
    out.push({ s: cursor, e: end, tone: seg.tone });
    cursor = end;
  }
  return out;
}

export default function CalendarView() {
  const supabase = useMemo(() => createClient(), []);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<ServiceWithSteps[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [appts, setAppts] = useState<ApptWithSteps[]>([]);
  const [notes, setNotes] = useState<CalendarNote[]>([]);
  const [days, setDays] = useState(4);
  const [start, setStart] = useState<string>(toDateStr(new Date()));
  const [zoom, setZoom] = useState(1);

  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [boxH, setBoxH] = useState(600); // スクロール枠の高さ(px)
  const pxRef = useRef(1); // 現在の px/分（ハンドラ用）
  const pendScrollRef = useRef<number | null>(null);
  const didInit = useRef(false);

  const [modal, setModal] = useState<
    | { mode: "add"; date: string; startMin: number }
    | { mode: "edit"; appt: ApptWithSteps }
    | null
  >(null);
  const [noteModal, setNoteModal] = useState<
    | { mode: "add"; date: string; allDay: boolean; startMin: number }
    | { mode: "edit"; note: CalendarNote }
    | null
  >(null);
  const [pop, setPop] = useState<{ date: string; startMin: number; x: number; y: number } | null>(
    null
  );

  useEffect(() => {
    (async () => {
      const [st, sv, eq, se] = await Promise.all([
        loadAllStaff(supabase),
        loadServices(supabase),
        loadEquipment(supabase),
        loadSettings(supabase),
      ]);
      setStaff(st.filter((s) => s.admin_visible && s.status !== "retired"));
      setServices(sv);
      setEquipment(eq);
      setSettings(se);
    })();
  }, [supabase]);

  const dateList = useMemo(() => {
    const [y, m, d] = start.split("-").map(Number);
    const base = new Date(y, m - 1, d);
    return Array.from({ length: days }, (_, i) => toDateStr(addDays(base, i)));
  }, [start, days]);

  const reload = useCallback(async () => {
    if (dateList.length === 0) return;
    const [{ data: aData }, { data: sData }, nt] = await Promise.all([
      supabase.from("appointments").select("*").in("date", dateList).eq("status", "booked"),
      supabase.from("appointment_steps").select("*").in("date", dateList),
      loadCalendarNotes(supabase, dateList),
    ]);
    const stepsByAppt: Record<string, AppointmentStep[]> = {};
    (sData ?? []).forEach((s: AppointmentStep) => {
      (stepsByAppt[s.appointment_id] ||= []).push(s);
    });
    setAppts((aData ?? []).map((a: Appointment) => ({ ...a, steps: stepsByAppt[a.id] || [] })));
    setNotes(nt);
  }, [supabase, dateList]);

  useEffect(() => {
    reload();
  }, [reload]);

  const staffColor = (id: string | null) => staff.find((s) => s.id === id)?.color || "#64748b";
  const staffName = (id: string | null) => staff.find((s) => s.id === id)?.name || "";

  // 川西整体院の予約は「阿部の青」で表示（川西院である事は上の終日メモで示す）
  const kawanishiId = useMemo(
    () => services.find((s) => s.category === "川西整体院")?.id ?? null,
    [services]
  );
  const abeColor = useMemo(
    () => staff.find((s) => s.name.includes("阿部"))?.color ?? "#2563eb",
    [staff]
  );

  // 営業時間（この幅が zoom=1 でちょうど画面に収まる基準）
  const boardStart = settings?.board_start_min ?? 540;
  const boardEnd = Math.max(boardStart + 60, settings?.board_end_min ?? 1290);

  // スクロール枠の高さを計測
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxH(el.clientHeight || 600));
    ro.observe(el);
    setBoxH(el.clientHeight || 600);
    return () => ro.disconnect();
  }, []);

  // px/分：営業時間ぶんが枠にちょうど収まる高さ × ズーム
  const headerH = headerRef.current?.offsetHeight ?? 52;
  const boardRange = boardEnd - boardStart;
  const basePx = Math.max(0.15, (boxH - headerH) / boardRange);
  // 縮小の下限：表示レンジ(6:00-24:00)全体がちょうど枠に収まる所で止める
  const zoomMin = Math.min(1, Math.max(0.2, boardRange / RANGE));
  const zoomMinRef = useRef(zoomMin);
  zoomMinRef.current = zoomMin;
  const pxPerMin = basePx * zoom;
  pxRef.current = pxPerMin;
  const gridH = RANGE * pxPerMin;

  // 設定読込などで下限が上がったら、はみ出さないよう補正
  useEffect(() => {
    setZoom((z) => (z < zoomMin ? zoomMin : z));
  }, [zoomMin]);
  const yFor = (m: number) => (Math.max(VIEW_START, Math.min(VIEW_END, m)) - VIEW_START) * pxPerMin;

  // 初回：営業開始が上に来るようスクロール
  useLayoutEffect(() => {
    if (didInit.current || boxH <= 0) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = (boardStart - VIEW_START) * pxPerMin;
    didInit.current = true;
  }, [boxH, pxPerMin, boardStart]);

  // ズーム変更後、焦点の時刻が同じ位置に来るようスクロール補正
  useLayoutEffect(() => {
    if (pendScrollRef.current != null && scrollRef.current) {
      scrollRef.current.scrollTop = pendScrollRef.current;
      pendScrollRef.current = null;
    }
  }, [zoom]);

  // focalClientY（画面上のY）を中心に factor 倍ズーム
  const zoomAt = useCallback(
    (factor: number, focalClientY: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const hH = headerRef.current?.offsetHeight ?? 52;
      const px = pxRef.current;
      const gridY = focalClientY - rect.top - hH + el.scrollTop;
      const t = VIEW_START + gridY / px;
      setZoom((z) => {
        const nz = Math.min(ZOOM_MAX, Math.max(zoomMinRef.current, z * factor));
        const npx = basePx * nz;
        const newGridY = (t - VIEW_START) * npx;
        pendScrollRef.current = Math.max(0, newGridY + hH - (focalClientY - rect.top));
        return nz;
      });
    },
    [basePx]
  );

  // ピンチズーム（2本指）
  const pinch = useRef<{ dist: number; zoom: number; midY: number } | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      swipe.current = null;
      const [a, b] = [e.touches[0], e.touches[1]];
      pinch.current = {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        zoom,
        midY: (a.clientY + b.clientY) / 2,
      };
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    const p = pinch.current;
    if (p && e.touches.length === 2) {
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const target = Math.min(ZOOM_MAX, Math.max(zoomMinRef.current, p.zoom * (dist / p.dist)));
      zoomAt(target / zoom, p.midY);
    }
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) pinch.current = null;
  }
  function zoomBtn(factor: number) {
    const el = scrollRef.current;
    const rect = el?.getBoundingClientRect();
    zoomAt(factor, rect ? rect.top + rect.height / 2 : 0);
  }

  // 横スワイプで期間送り（左へ＝翌週、右へ＝前週）。縦スクロールとは競合させない。
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false);
  function shift(dir: number) {
    setStart(toDateStr(addDays(new Date(start + "T00:00:00"), dir * days)));
  }
  function onSwipeStart(e: React.TouchEvent) {
    if (e.touches.length === 1) swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onSwipeEnd(e: React.TouchEvent) {
    const s = swipe.current;
    swipe.current = null;
    if (!s || pinch.current || e.touches.length > 0) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      swipedRef.current = true;
      shift(dx < 0 ? 1 : -1);
    }
  }

  const hours: number[] = [];
  for (let t = Math.ceil(VIEW_START / 60) * 60; t <= VIEW_END; t += 60) hours.push(t);
  const todayStr = toDateStr(new Date());

  return (
    <div>
      {/* 操作バー */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setStart(toDateStr(addDays(new Date(start + "T00:00:00"), -days)))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 active:bg-slate-100"
        >
          ‹ 前
        </button>
        <button
          onClick={() => setStart(toDateStr(new Date()))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 active:bg-slate-100"
        >
          今日
        </button>
        <button
          onClick={() => setStart(toDateStr(addDays(new Date(start + "T00:00:00"), days)))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 active:bg-slate-100"
        >
          次 ›
        </button>
        <input
          type="date"
          value={start}
          onChange={(e) => e.target.value && setStart(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
        {/* 拡大縮小 */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => zoomBtn(1 / 1.25)}
            className="h-8 w-8 rounded-lg border border-slate-300 bg-white text-lg font-bold text-slate-600 active:bg-slate-100"
            aria-label="縮小"
          >
            −
          </button>
          <button
            onClick={() => zoomBtn(1.25)}
            className="h-8 w-8 rounded-lg border border-slate-300 bg-white text-lg font-bold text-slate-600 active:bg-slate-100"
            aria-label="拡大"
          >
            ＋
          </button>
        </div>
        <div className="ml-auto flex gap-1">
          {[1, 3, 4, 7].map((n) => (
            <button
              key={n}
              onClick={() => setDays(n)}
              className={`rounded-md border px-2.5 py-1 text-xs font-bold ${
                days === n ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-600"
              }`}
            >
              {n}日
            </button>
          ))}
        </div>
      </div>

      {/* カレンダー本体：縦スクロール＋ピンチ拡大／横スクロールで次の日 */}
      <div
        ref={scrollRef}
        className="relative overflow-y-auto overflow-x-hidden rounded-xl border bg-white"
        style={{ height: "calc(100dvh - 170px)", touchAction: "pan-y" }}
        onTouchStart={(e) => {
          onTouchStart(e);
          onSwipeStart(e);
        }}
        onTouchMove={onTouchMove}
        onTouchEnd={(e) => {
          onSwipeEnd(e);
          onTouchEnd(e);
        }}
      >
        <div>
          {/* 固定ヘッダー（日付＋終日メモ帯） */}
          <div ref={headerRef} className="sticky top-0 z-30 bg-white">
            {/* 日付ヘッダー */}
            <div className="flex border-b">
              <div className="shrink-0 bg-white" style={{ width: GUTTER }} />
              {dateList.map((ds) => {
                const dd = new Date(ds + "T00:00:00");
                const isToday = ds === todayStr;
                return (
                  <div
                    key={ds}
                    className={`min-w-0 flex-1 border-l py-1 text-center text-xs font-bold ${
                      isToday ? "text-blue-600" : "text-slate-600"
                    }`}
                  >
                    {dd.getMonth() + 1}/{dd.getDate()}（{WEEKDAY_LABELS[dd.getDay()]}）
                  </div>
                );
              })}
            </div>
            {/* 終日メモ帯（受付シフト等）*/}
            <div className="flex border-b bg-slate-50/60">
              <div className="shrink-0 bg-slate-50" style={{ width: GUTTER }} />
              {dateList.map((ds) => {
                const allDay = notes.filter((n) => n.date === ds && n.start_min == null);
                return (
                  <div
                    key={ds}
                    className="min-w-0 flex-1 cursor-pointer border-l p-0.5"
                    style={{ minHeight: 20 }}
                    onClick={(e) => {
                      if (e.target !== e.currentTarget) return;
                      setNoteModal({ mode: "add", date: ds, allDay: true, startMin: boardStart });
                    }}
                  >
                    {allDay.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => setNoteModal({ mode: "edit", note: n })}
                        className="mb-0.5 block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-bold text-white"
                        style={{ backgroundColor: n.color || "#64748b" }}
                      >
                        {n.text}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 時間グリッド */}
          <div className="flex" style={{ height: gridH }}>
            {/* 左：時間軸 */}
            <div className="relative shrink-0 border-r bg-white" style={{ width: GUTTER, height: gridH }}>
              {hours.map((t) => (
                <div
                  key={t}
                  className="absolute right-1 -translate-y-1/2 text-[10px] text-slate-400"
                  style={{ top: yFor(t) }}
                >
                  {minToLabel(t)}
                </div>
              ))}
            </div>

            {dateList.map((ds) => {
              const items: Item[] = [
                ...appts
                  .filter((a) => a.date === ds)
                  .map((a): Item => {
                    const rk = staff.findIndex((s) => s.id === a.staff_id);
                    const segs = apptSegments(a);
                    return {
                      kind: "appt",
                      s: segs[0].s,
                      e: segs[segs.length - 1].e,
                      rank: rk === -1 ? 900 : rk,
                      appt: a,
                    };
                  }),
                ...notes
                  .filter((n) => n.date === ds && n.start_min != null)
                  .map((n): Item => ({
                    kind: "note",
                    s: snap(n.start_min as number),
                    e: Math.max(
                      snap(n.end_min ?? (n.start_min as number) + SNAP),
                      snap(n.start_min as number) + SNAP
                    ),
                    rank: 999,
                    note: n,
                  })),
              ];
              const laid = layoutLanes(items);
              return (
                <div
                  key={ds}
                  className="relative min-w-0 flex-1 border-l"
                  style={{ height: gridH }}
                  onClick={(e) => {
                    if (swipedRef.current) {
                      swipedRef.current = false;
                      return;
                    }
                    if (e.target !== e.currentTarget) return;
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const raw = VIEW_START + ((e.clientY - rect.top) / rect.height) * RANGE;
                    setPop({ date: ds, startMin: snap(raw), x: e.clientX, y: e.clientY });
                  }}
                >
                  {hours.map((t) => (
                    <div
                      key={t}
                      className="pointer-events-none absolute left-0 w-full border-t border-slate-100"
                      style={{ top: yFor(t) }}
                    />
                  ))}
                  {laid.map((it) => {
                    const top = yFor(it.s);
                    const style = {
                      top,
                      height: yFor(it.e) - top - 1,
                      left: `calc(${(it.lane * 100) / it.cols}% + 1px)`,
                      width: `calc(${100 / it.cols}% - 2px)`,
                    };
                    if (it.kind === "note") {
                      return (
                        <button
                          key={it.note.id}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setNoteModal({ mode: "edit", note: it.note });
                          }}
                          className="absolute overflow-hidden rounded-[5px] px-1 pt-[3px] text-left text-[12px] font-semibold leading-[1.32] text-white shadow-sm"
                          style={{
                            ...style,
                            backgroundColor: it.note.color || "#64748b",
                            wordBreak: "break-word",
                            textShadow: "0 1px 2px rgba(0,0,0,.5)",
                          }}
                        >
                          {it.note.text}
                        </button>
                      );
                    }
                    const a = it.appt;
                    const col = a.service_id === kawanishiId ? abeColor : staffColor(a.staff_id);
                    const segs = apptSegments(a);
                    return (
                      <button
                        key={a.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setModal({ mode: "edit", appt: a });
                        }}
                        className="absolute overflow-hidden rounded-[5px] shadow-sm"
                        style={{ ...style, backgroundColor: col }}
                        title={`${minToLabel(a.start_min)} ${a.patient_name ?? ""}（${staffName(a.staff_id)}）`}
                      >
                        {segs.map((sg, i) => (
                          <div
                            key={i}
                            className="absolute left-0 w-full"
                            style={{
                              top: yFor(sg.s) - top,
                              height: yFor(sg.e) - yFor(sg.s),
                              backgroundColor: sg.tone === "light" ? lighten(col, 0.42) : col,
                              borderTop: i > 0 ? "1px solid rgba(255,255,255,.5)" : undefined,
                            }}
                          />
                        ))}
                        <span
                          className="pointer-events-none absolute inset-0 overflow-hidden px-1 pt-[3px] text-[12px] font-semibold leading-[1.32] text-white"
                          style={{ wordBreak: "break-word", textShadow: "0 1px 2px rgba(0,0,0,.55)" }}
                        >
                          {a.patient_name || "（未登録）"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="mt-1.5 text-[11px] text-slate-400">
        空き時間タップで「予約」か「メモ」、上の帯タップで終日メモ。2本指ピンチ／＋−で拡大縮小できます。
      </p>

      {/* 空きタップ → 予約 or メモ 選択 */}
      {pop && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPop(null)} />
          <div
            className="fixed z-50 w-44 -translate-x-1/2 rounded-xl border bg-white p-2 shadow-xl"
            style={{
              left: Math.min(Math.max(pop.x, 100), window.innerWidth - 100),
              top: Math.min(pop.y + 6, window.innerHeight - 130),
            }}
          >
            <div className="mb-1 text-center text-[11px] text-slate-500">
              {pop.date.slice(5)} {minToLabel(pop.startMin)}
            </div>
            <button
              onClick={() => {
                setModal({ mode: "add", date: pop.date, startMin: pop.startMin });
                setPop(null);
              }}
              className="w-full rounded-lg bg-blue-600 py-2 text-sm font-bold text-white active:bg-blue-700"
            >
              予約を追加
            </button>
            <button
              onClick={() => {
                setNoteModal({ mode: "add", date: pop.date, allDay: false, startMin: pop.startMin });
                setPop(null);
              }}
              className="mt-1.5 w-full rounded-lg border border-slate-300 py-2 text-sm font-bold text-slate-700 active:bg-slate-100"
            >
              メモを追加
            </button>
          </div>
        </>
      )}

      {modal && (
        <AdminBookingModal
          mode={modal.mode}
          appt={modal.mode === "edit" ? modal.appt : undefined}
          initialStartMin={modal.mode === "add" ? modal.startMin : undefined}
          date={modal.mode === "add" ? modal.date : modal.appt.date}
          staff={staff}
          services={services}
          equipment={equipment}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            reload();
          }}
        />
      )}

      {noteModal && (
        <NoteModal
          supabase={supabase}
          data={noteModal}
          onClose={() => setNoteModal(null)}
          onDone={() => {
            setNoteModal(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

// ---- メモ（受付シフト・zoom等）の追加・編集 -----------------------------
function NoteModal({
  supabase,
  data,
  onClose,
  onDone,
}: {
  supabase: ReturnType<typeof createClient>;
  data:
    | { mode: "add"; date: string; allDay: boolean; startMin: number }
    | { mode: "edit"; note: CalendarNote };
  onClose: () => void;
  onDone: () => void;
}) {
  const editing = data.mode === "edit" ? data.note : null;
  const [text, setText] = useState(editing?.text ?? "");
  const [color, setColor] = useState(editing?.color ?? NOTE_COLORS[0]);
  const allDay = editing ? editing.start_min == null : data.mode === "add" && data.allDay;
  const initStart = editing?.start_min ?? (data.mode === "add" ? data.startMin : 600);
  const [startMin, setStartMin] = useState<number>(initStart ?? 600);
  const [endMin, setEndMin] = useState<number>(editing?.end_min ?? (initStart ?? 600) + 60);
  const [busy, setBusy] = useState(false);
  const date = editing?.date ?? (data.mode === "add" ? data.date : "");

  async function save() {
    if (!text.trim()) return;
    setBusy(true);
    const row = {
      date,
      text: text.trim(),
      color,
      start_min: allDay ? null : startMin,
      end_min: allDay ? null : Math.max(endMin, startMin + 15),
    };
    if (editing) await supabase.from("calendar_notes").update(row).eq("id", editing.id);
    else await supabase.from("calendar_notes").insert(row);
    setBusy(false);
    onDone();
  }
  async function remove() {
    if (!editing) return;
    if (!confirm("このメモを削除しますか？")) return;
    await supabase.from("calendar_notes").delete().eq("id", editing.id);
    onDone();
  }

  const timeInput = (val: number, set: (n: number) => void) => (
    <input
      type="time"
      step={300}
      value={minToLabel(val)}
      onChange={(e) => {
        const [h, m] = e.target.value.split(":").map(Number);
        if (!isNaN(h)) set(h * 60 + (m || 0));
      }}
      className="rounded-md border px-2 py-1 text-sm"
    />
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 text-sm font-bold text-slate-700">
          {editing ? "メモを編集" : allDay ? "終日メモ（受付シフト等）" : "メモを追加"}
        </div>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="例：受付 上野 16-20 ／ zoom会議 ／ ゴミ捨て"
          className="mb-3 w-full rounded-lg border px-3 py-2 text-sm"
          autoFocus
        />
        {!allDay && (
          <div className="mb-3 flex items-center gap-2 text-sm text-slate-600">
            {timeInput(startMin, setStartMin)}
            <span>〜</span>
            {timeInput(endMin, setEndMin)}
          </div>
        )}
        <div className="mb-4 flex gap-2">
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`h-7 w-7 rounded-full ${color === c ? "ring-2 ring-offset-2 ring-slate-500" : ""}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          {editing && (
            <button onClick={remove} className="rounded-lg px-3 py-2 text-sm font-bold text-red-500">
              削除
            </button>
          )}
          <button onClick={onClose} className="ml-auto rounded-lg border px-4 py-2 text-sm text-slate-600">
            閉じる
          </button>
          <button
            onClick={save}
            disabled={busy || !text.trim()}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white disabled:bg-slate-300"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
