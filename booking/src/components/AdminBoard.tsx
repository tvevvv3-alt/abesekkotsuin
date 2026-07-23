"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  loadAllStaff,
  loadClosures,
  loadEquipment,
  loadOpenings,
  loadSchedules,
  loadServices,
  loadSettings,
} from "@/lib/data";
import type {
  Appointment,
  AppointmentStep,
  Closure,
  Equipment,
  Opening,
  ServiceWithSteps,
  Settings,
  Staff,
  StaffSchedule,
} from "@/lib/types";
import { minToLabel, WEEKDAY_LABELS } from "@/lib/booking";
import AdminBookingModal from "./AdminBookingModal";

const PX_PER_MIN = 1.4;
const GRID_STEP = 30; // 目盛り・スナップ（分）

// 列コンテキスト：担当者列 or メニュー列（体幹/川西/ハイチャージ）
type ColCtx = { staffId?: string; serviceId?: string; canClose: boolean };
const ctxKey = (c: ColCtx) => c.staffId ?? `svc:${c.serviceId}`;

// 重なる予約を横に並べる（lane=何列目 / cols=同時最大列数）
function layoutLanes<T extends { s: number; e: number }>(
  items: T[]
): (T & { lane: number; cols: number })[] {
  const sorted = [...items].sort((a, b) => a.s - b.s || a.e - b.e);
  const out: (T & { lane: number; cols: number })[] = [];
  let cluster: (T & { lane: number; cols: number })[] = [];
  let clusterEnd = -Infinity;
  const laneEnd: number[] = [];
  const flush = () => {
    const cols = cluster.reduce((m, c) => Math.max(m, c.lane + 1), 0);
    cluster.forEach((c) => (c.cols = cols));
    out.push(...cluster);
    cluster = [];
    laneEnd.length = 0;
  };
  for (const it of sorted) {
    if (cluster.length && it.s >= clusterEnd) flush();
    let lane = laneEnd.findIndex((end) => end <= it.s);
    if (lane === -1) {
      lane = laneEnd.length;
      laneEnd.push(it.e);
    } else laneEnd[lane] = it.e;
    cluster.push({ ...it, lane, cols: 1 });
    clusterEnd = Math.max(clusterEnd, it.e);
  }
  if (cluster.length) flush();
  return out;
}

interface ApptWithSteps extends Appointment {
  steps: AppointmentStep[];
}

const KAWANISHI_COLOR = "#3F51B5"; // 川西整体院＝阿部の青（カレンダーに合わせる）
const CLASS_COLOR = "#EF6C00"; // 体幹教室＝オレンジ
const TEXT_SHADOW = "0 1px 1px rgba(0,0,0,.28)"; // 白文字の控えめな影

// カレンダーと同じ：白文字が読めるよう明るすぎる色は暗くし、通電(light)は少し薄くする
function segColor(hex: string, tone: "light" | "dark"): string {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  let r = parseInt(n.slice(0, 2), 16);
  let g = parseInt(n.slice(2, 4), 16);
  let b = parseInt(n.slice(4, 6), 16);
  if ([r, g, b].some(isNaN)) return hex;
  const L = 0.299 * r + 0.587 * g + 0.114 * b;
  if (L > 150) {
    const f = 150 / L;
    r *= f;
    g *= f;
    b *= f;
  }
  if (tone === "light") {
    const a = 0.3;
    r += (255 - r) * a;
    g += (255 - g) * a;
    b += (255 - b) * a;
  }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

// 工程の色分け：通電＝薄い / 施術＝濃い
function stepTone(st: AppointmentStep): "light" | "dark" {
  if (/通電/.test(st.name)) return "light";
  if (/施術|手技|整体|矯正|マッサージ|検査|カウンセリング/.test(st.name)) return "dark";
  return st.uses_staff ? "dark" : "light";
}

// 予約を「薄い通電 / 濃い施術」のセグメントへ分解（30分グリッドで区切る＝カレンダーと同じ）
function apptSegments(
  a: ApptWithSteps,
  s: number,
  e: number
): { s: number; e: number; tone: "light" | "dark" }[] {
  const snap30 = (m: number) => Math.round(m / 30) * 30;
  const blockStart = snap30(s);
  const blockEnd = Math.max(snap30(e), blockStart + 30);
  const steps = (a.steps ?? [])
    .filter((st) => st.start_min != null && st.end_min != null)
    .sort((x, y) => x.start_min - y.start_min);
  if (steps.length === 0) return [{ s: blockStart, e: blockEnd, tone: "dark" }];
  const merged: { s: number; e: number; tone: "light" | "dark" }[] = [];
  for (const st of steps) {
    const tone = stepTone(st);
    const last = merged[merged.length - 1];
    if (last && last.tone === tone && st.start_min <= last.e) {
      last.e = Math.max(last.e, st.end_min);
    } else {
      merged.push({ s: st.start_min, e: st.end_min, tone });
    }
  }
  let cursor = blockStart;
  const out: { s: number; e: number; tone: "light" | "dark" }[] = [];
  for (const seg of merged) {
    let end = snap30(seg.e);
    if (end <= cursor) end = cursor + 30;
    out.push({ s: cursor, e: end, tone: seg.tone });
    cursor = end;
  }
  return out;
}

// 列に描く休診バンド
interface ClosureBand {
  id: string;
  start: number;
  end: number;
  reason: string | null;
}

export default function AdminBoard({ date }: { date: string }) {
  const supabase = useMemo(() => createClient(), []);

  const [staff, setStaff] = useState<Staff[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [services, setServices] = useState<ServiceWithSteps[]>([]);
  const [schedules, setSchedules] = useState<StaffSchedule[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [appts, setAppts] = useState<ApptWithSteps[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [loading, setLoading] = useState(true);

  // モーダル：追加は担当者・時刻をプリセットできる
  const [modal, setModal] = useState<
    | { mode: "add"; staffId?: string; serviceId?: string; startMin?: number }
    | { mode: "edit"; appt: ApptWithSteps }
    | null
  >(null);

  // ドラッグ選択の状態（列コンテキスト付き：担当者列 or メニュー列）
  const [drag, setDrag] = useState<{ ctx: ColCtx; a: number; b: number } | null>(null);
  // ドラッグ確定後に出す2択メニュー
  const [pop, setPop] = useState<
    { ctx: ColCtx; start: number; end: number; x: number; y: number } | null
  >(null);
  const trackTopRef = useRef(0);
  const downRef = useRef<
    { ctx: ColCtx; x: number; y: number; startMin: number; mouse: boolean } | null
  >(null);

  // マスタ（初回）
  useEffect(() => {
    (async () => {
      const [st, eq, sv, sc, se] = await Promise.all([
        loadAllStaff(supabase),
        loadEquipment(supabase),
        loadServices(supabase),
        loadSchedules(supabase),
        loadSettings(supabase),
      ]);
      // 管理画面に表示するスタッフ（退職は列から除外、過去予約は保持）
      setStaff(st.filter((s) => s.admin_visible && s.status !== "retired"));
      setEquipment(eq);
      setServices(sv);
      setSchedules(sc);
      setSettings(se);
    })();
  }, [supabase]);

  const reload = useCallback(async () => {
    setLoading(true);
    const [{ data: aData }, { data: sData }, cl, op] = await Promise.all([
      supabase.from("appointments").select("*").eq("date", date).neq("status", "cancelled"),
      supabase.from("appointment_steps").select("*").eq("date", date),
      loadClosures(supabase, [date]),
      loadOpenings(supabase, [date]),
    ]);
    const stepsByAppt: Record<string, AppointmentStep[]> = {};
    (sData ?? []).forEach((s: AppointmentStep) => {
      (stepsByAppt[s.appointment_id] ||= []).push(s);
    });
    const merged: ApptWithSteps[] = (aData ?? []).map((a: Appointment) => ({
      ...a,
      steps: (stepsByAppt[a.id] || []).sort((x, y) => x.start_min - y.start_min),
    }));
    setAppts(merged);
    setClosures(cl);
    setOpenings(op);
    setLoading(false);
  }, [supabase, date]);

  useEffect(() => {
    reload();
  }, [reload]);

  const weekday = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d).getDay();
  }, [date]);

  const daySchedules = useMemo(
    () => schedules.filter((s) => s.weekday === weekday),
    [schedules, weekday]
  );

  // ボード表示範囲。勤務時間外（例: 20:30以降の時間外予約）もドラッグで追加できるよう
  // 設定の board_start/board_end まで常に広げて表示する。
  const [minMin, maxMin] = useMemo(() => {
    const bStart = Math.min(540, settings?.board_start_min ?? 540); // 9時スタート（早番があればさらに前へ）
    const bEnd = settings?.board_end_min ?? 1320;
    if (daySchedules.length === 0) return [bStart, bEnd];
    return [
      Math.min(bStart, ...daySchedules.map((s) => s.start_min)),
      Math.max(bEnd, ...daySchedules.map((s) => s.end_min)),
    ];
  }, [daySchedules, settings]);

  // 昼休みなど「勤務の内部ギャップ」を圧縮して 10-20時を一目で見やすくする
  const BREAK_SCALE = 0.32;
  const breakGap = useMemo<[number, number] | null>(() => {
    const iv = daySchedules
      .map((s) => [s.start_min, s.end_min] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    if (iv.length < 2) return null;
    const merged: [number, number][] = [];
    for (const [a, b] of iv) {
      const last = merged[merged.length - 1];
      if (last && a <= last[1]) last[1] = Math.max(last[1], b);
      else merged.push([a, b]);
    }
    if (merged.length < 2) return null;
    const gs = merged[0][1];
    const ge = merged[1][0];
    return ge - gs >= 60 ? [gs, ge] : null; // 1時間以上の内部ギャップ（昼休み）のみ圧縮
  }, [daySchedules]);

  const yFor = useCallback(
    (m: number) => {
      const x = Math.max(minMin, Math.min(maxMin, m));
      if (!breakGap) return (x - minMin) * PX_PER_MIN;
      const [gs, ge] = breakGap;
      if (x <= gs) return (x - minMin) * PX_PER_MIN;
      if (x >= ge) return (gs - minMin + (ge - gs) * BREAK_SCALE + (x - ge)) * PX_PER_MIN;
      return (gs - minMin + (x - gs) * BREAK_SCALE) * PX_PER_MIN;
    },
    [minMin, maxMin, breakGap]
  );
  const minForY = useCallback(
    (y: number) => {
      if (!breakGap) return minMin + y / PX_PER_MIN;
      const [gs, ge] = breakGap;
      const yGs = (gs - minMin) * PX_PER_MIN;
      const yGe = yGs + (ge - gs) * BREAK_SCALE * PX_PER_MIN;
      if (y <= yGs) return minMin + y / PX_PER_MIN;
      if (y >= yGe) return ge + (y - yGe) / PX_PER_MIN;
      return gs + (y - yGs) / (PX_PER_MIN * BREAK_SCALE);
    },
    [minMin, maxMin, breakGap]
  );

  const height = yFor(maxMin);
  const ticks: number[] = [];
  for (let t = Math.ceil(minMin / GRID_STEP) * GRID_STEP; t <= maxMin; t += GRID_STEP) {
    // 圧縮した昼休み内は毎時のみ表示（ラベル重なり防止）
    if (breakGap && t > breakGap[0] && t < breakGap[1] && t % 60 !== 0) continue;
    ticks.push(t);
  }

  function staffOffRanges(staffId: string): Array<[number, number]> {
    const shifts = daySchedules
      .filter((s) => s.staff_id === staffId)
      .sort((a, b) => a.start_min - b.start_min);
    const ranges: Array<[number, number]> = [];
    let cursor = minMin;
    for (const s of shifts) {
      if (s.start_min > cursor) ranges.push([cursor, s.start_min]);
      cursor = Math.max(cursor, s.end_min);
    }
    if (cursor < maxMin) ranges.push([cursor, maxMin]);
    if (shifts.length === 0) ranges.push([minMin, maxMin]);
    return ranges;
  }

  // 体幹教室（クラス）の勤務外グレー＝開始枠（17:00/18:00/19:30など）以外はすべてグレー。
  // 開け閉めは手動（予約可能にする／休診にする）で行う。
  function classOffRanges(cls: ServiceWithSteps): Array<[number, number]> {
    const starts = (cls.class_starts ?? "")
      .split(",")
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);
    // 開始枠が未設定なら終日グレー（手動で開ける）
    if (starts.length === 0) return [[minMin, maxMin]];
    const dur = Math.max(30, cls.steps.reduce((s, st) => s + st.duration_min, 0));
    const windows: Array<[number, number]> = [];
    for (const s of starts) {
      const w: [number, number] = [s, s + dur];
      const last = windows[windows.length - 1];
      if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1]);
      else windows.push(w);
    }
    // 開始枠ウィンドウの「すき間」をグレーにする
    const ranges: Array<[number, number]> = [];
    let cursor = minMin;
    for (const [a, b] of windows) {
      if (a > cursor) ranges.push([cursor, Math.min(a, maxMin)]);
      cursor = Math.max(cursor, b);
    }
    if (cursor < maxMin) ranges.push([cursor, maxMin]);
    return ranges;
  }

  // 当該担当者に効く休診（院全体 or 個別）をバンド化
  function closureBands(staffId: string): ClosureBand[] {
    return closures
      .filter(
        (c) => c.service_id === null && (c.staff_id === null || c.staff_id === staffId)
      )
      .map((c) => ({
        id: c.id,
        start: c.start_min ?? minMin,
        end: c.end_min ?? maxMin,
        reason: c.reason,
      }));
  }

  // 川西整体院（別院）：列は廃止し、阿部の列に茶色で表示する
  const kawanishiService = useMemo(
    () => services.find((s) => s.category === "川西整体院") || null,
    [services]
  );

  // 定員制クラス（体幹教室）：同時刻でグループ化して人数を表示
  const classServices = useMemo(
    () => services.filter((s) => s.capacity > 1),
    [services]
  );

  // 川西整体院を受け持つ列（＝阿部）。名前に「阿部」を含むスタッフ、無ければ先頭。
  const kawanishiHostId = useMemo(() => {
    const abe = staff.find((s) => s.name.includes("阿部"));
    return abe?.id ?? staff[0]?.id ?? null;
  }, [staff]);

  // 担当者列から除外するサービス（体幹教室＝別列 / 川西＝阿部列に別枠で追加）
  const excludeFromStaff = useMemo(() => {
    const set = new Set<string>();
    classServices.forEach((c) => set.add(c.id));
    if (kawanishiService) set.add(kawanishiService.id);
    return set;
  }, [classServices, kawanishiService]);

  // 担当者列のカード（通常予約＋阿部列には川西を茶色で追加）→ 重なりはレーン分割
  function columnCards(st: Staff) {
    type Card = {
      appt: ApptWithSteps;
      s: number;
      e: number;
      color: string;
      kawanishi: boolean;
    };
    const cards: Card[] = [];
    appts
      .filter((a) => !excludeFromStaff.has(a.service_id ?? ""))
      .filter((a) =>
        a.staff_id
          ? a.staff_id === st.id
          : a.steps.some((x) => x.uses_staff && x.staff_id === st.id)
      )
      .forEach((a) => {
        const withT = a.steps.filter((x) => x.start_min != null);
        const s = withT.length ? Math.min(...withT.map((x) => x.start_min)) : a.start_min;
        const e = withT.length ? Math.max(...withT.map((x) => x.end_min)) : a.end_min;
        cards.push({ appt: a, s, e, color: st.color || "#334155", kawanishi: false });
      });
    if (kawanishiService && kawanishiHostId === st.id) {
      appts
        .filter((a) => a.service_id === kawanishiService.id)
        .forEach((a) =>
          cards.push({
            appt: a,
            s: a.start_min,
            e: a.end_min,
            color: KAWANISHI_COLOR,
            kawanishi: true,
          })
        );
    }
    return layoutLanes(cards);
  }
  function classGroups(serviceId: string) {
    const map: Record<string, { start: number; end: number; list: ApptWithSteps[] }> = {};
    appts
      .filter((a) => a.service_id === serviceId)
      .forEach((a) => {
        const k = `${a.start_min}-${a.end_min}`;
        (map[k] ||= { start: a.start_min, end: a.end_min, list: [] }).list.push(a);
      });
    return Object.values(map);
  }

  // ---- ドラッグ選択 ----
  const snap = (m: number) => Math.round(m / GRID_STEP) * GRID_STEP;
  const yToMin = (clientY: number) => minForY(clientY - trackTopRef.current);

  // タッチ＝スクロール優先／マウス＝ドラッグ選択。タップ(=ほぼ動かない)で30分枠のメニュー表示。
  function beginDrag(ctx: ColCtx, e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    trackTopRef.current = rect.top;
    downRef.current = {
      ctx,
      x: e.clientX,
      y: e.clientY,
      startMin: snap(yToMin(e.clientY)),
      mouse: e.pointerType === "mouse",
    };
    setPop(null);
    // マウスのみ即キャプチャしてドラッグ選択（タッチはブラウザのスクロールに任せる）
    if (e.pointerType === "mouse") {
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}
    }
  }
  function moveDrag(e: React.PointerEvent) {
    const d = downRef.current;
    if (!d || !d.mouse) return; // タッチはスクロールさせる
    const m = snap(yToMin(e.clientY));
    if (!drag) {
      if (Math.abs(e.clientY - d.y) < 4 && Math.abs(e.clientX - d.x) < 4) return;
      setDrag({ ctx: d.ctx, a: d.startMin, b: m });
    } else {
      setDrag((dd) => (dd ? { ...dd, b: m } : dd));
    }
  }
  function endDrag(e: React.PointerEvent) {
    const d = downRef.current;
    downRef.current = null;
    if (drag) {
      const lo = Math.max(minMin, Math.min(drag.a, drag.b));
      let hi = Math.min(maxMin, Math.max(drag.a, drag.b));
      if (hi <= lo) hi = Math.min(maxMin, lo + GRID_STEP);
      const ctx = drag.ctx;
      setDrag(null);
      setPop({ ctx, start: lo, end: hi, x: e.clientX, y: e.clientY });
      return;
    }
    // タップ（ほぼ動いていない）→ 30分枠のメニュー
    if (d && Math.abs(e.clientY - d.y) < 8 && Math.abs(e.clientX - d.x) < 8) {
      const lo = Math.max(minMin, d.startMin);
      const hi = Math.min(maxMin, lo + GRID_STEP);
      setPop({ ctx: d.ctx, start: lo, end: hi, x: e.clientX, y: e.clientY });
    }
  }
  function cancelDrag() {
    downRef.current = null;
    setDrag(null);
  }

  function bandFor(ctx: ColCtx): [number, number] | null {
    if (drag && ctxKey(drag.ctx) === ctxKey(ctx))
      return [Math.min(drag.a, drag.b), Math.max(drag.a, drag.b)];
    if (pop && ctxKey(pop.ctx) === ctxKey(ctx)) return [pop.start, pop.end];
    return null;
  }

  async function makeClosure() {
    if (!pop) return;
    await supabase.from("closures").insert({
      date,
      staff_id: pop.ctx.staffId ?? null,
      service_id: pop.ctx.serviceId ?? null,
      start_min: pop.start,
      end_min: pop.end,
      reason: null,
    });
    setPop(null);
    reload();
  }

  async function removeClosure(id: string) {
    if (!confirm("この休診を解除しますか？")) return;
    await supabase.from("closures").delete().eq("id", id);
    reload();
  }

  // 臨時の予約可能枠（昼休み開放・体幹の臨時開催など）を作成／解除
  async function makeOpening() {
    if (!pop || (!pop.ctx.staffId && !pop.ctx.serviceId)) return;
    await supabase.from("openings").insert({
      date,
      staff_id: pop.ctx.staffId ?? null,
      service_id: pop.ctx.serviceId ?? null,
      start_min: pop.start,
      end_min: pop.end,
    });
    setPop(null);
    reload();
  }
  async function removeOpening(id: string) {
    if (!confirm("この予約可能枠を解除しますか？")) return;
    await supabase.from("openings").delete().eq("id", id);
    reload();
  }
  // 当該担当者の臨時開放枠
  function openingBands(staffId: string): Opening[] {
    return openings.filter((o) => o.staff_id === staffId);
  }
  // 当該クラス（体幹教室）の臨時開放枠
  function classOpeningBands(serviceId: string): Opening[] {
    return openings.filter((o) => o.service_id === serviceId);
  }

  const dObj = (() => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d);
  })();

  return (
    <div>
      {/* 日付表示＋予約追加（前後・今日は上部の共通ツールバー） */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold text-slate-700">
          {dObj.getMonth() + 1}/{dObj.getDate()}（{WEEKDAY_LABELS[dObj.getDay()]}）
        </span>
        <button
          onClick={() => setModal({ mode: "add" })}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white active:bg-blue-700"
        >
          ＋ 予約追加
        </button>
      </div>

      <p className="mb-2 text-xs text-slate-400">
        空き時間を上下にドラッグ → 「予約を追加」か「休診にする」を選べます。
      </p>

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">読み込み中…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <div className="flex min-w-[420px]">
            {/* 時間ラベル列 */}
            <div className="w-12 shrink-0 border-r bg-slate-50">
              <div className="h-8 border-b" />
              <div className="relative" style={{ height }}>
                {ticks.map((t) => (
                  <div
                    key={t}
                    className="absolute left-0 w-full pr-1 text-right text-[10px] text-slate-400"
                    style={{ top: yFor(t) - 6 }}
                  >
                    {minToLabel(t)}
                  </div>
                ))}
              </div>
            </div>

            {/* 担当者列 */}
            {staff.map((st) => {
              const ctx: ColCtx = { staffId: st.id, canClose: true };
              return (
                <Column
                  key={st.id}
                  header={st.name}
                  headerColor={st.color || "#334155"}
                  height={height}
                  yFor={yFor}
                  ticks={ticks}
                  offRanges={staffOffRanges(st.id)}
                  closureBands={closureBands(st.id)}
                  onClosureClick={removeClosure}
                  openingBands={openingBands(st.id)}
                  onOpeningClick={removeOpening}
                  band={bandFor(ctx)}
                  onPointerDownTrack={(e) => beginDrag(ctx, e)}
                  onPointerMoveTrack={moveDrag}
                  onPointerUpTrack={endDrag}
                  onPointerCancelTrack={cancelDrag}
                >
                  {columnCards(st).map(({ appt, s, e, color, kawanishi, lane, cols }) => {
                    const topSnap = snap(s);
                    const botSnap = Math.max(snap(e), topSnap + GRID_STEP);
                    const cardTop = yFor(topSnap);
                    const w = 100 / cols;
                    // 川西は単色、通常予約は通電（薄）＋施術（濃）の2段
                    const segs = kawanishi
                      ? [{ s: topSnap, e: botSnap, tone: "dark" as const }]
                      : apptSegments(appt, topSnap, botSnap);
                    return (
                      <button
                        key={`${appt.id}-${lane}`}
                        onClick={() => setModal({ mode: "edit", appt })}
                        className="absolute z-20"
                        style={{
                          top: cardTop,
                          height: yFor(botSnap) - cardTop - 2,
                          left: `calc(${lane * w}% + 2px)`,
                          width: `calc(${w}% - 4px)`,
                          background: "transparent",
                          opacity: appt.status === "done" ? 0.5 : undefined,
                        }}
                        title={`${minToLabel(appt.start_min)} ${appt.patient_name ?? ""}`}
                      >
                        {appt.status === "done" && (
                          <span className="absolute right-0.5 top-0.5 z-30 rounded bg-white/90 px-1 text-[9px] font-bold text-slate-600">
                            済
                          </span>
                        )}
                        {segs.map((sg, i) => (
                          <div
                            key={i}
                            className="absolute inset-x-0 flex items-center justify-start overflow-hidden rounded-[4px] px-1 text-left shadow-sm"
                            style={{
                              top: yFor(sg.s) - cardTop,
                              height: yFor(sg.e) - yFor(sg.s),
                              backgroundColor: kawanishi ? color : segColor(color, sg.tone),
                              border: "0.5px solid rgba(255,255,255,.95)",
                            }}
                          >
                            <span
                              className="w-full overflow-hidden whitespace-nowrap text-[11.5px] font-medium leading-[1.15] text-white"
                              style={{ textShadow: TEXT_SHADOW }}
                            >
                              {appt.patient_name || "（未登録）"}
                              <span className="ml-1 font-normal opacity-90">{minToLabel(sg.s)}</span>
                            </span>
                          </div>
                        ))}
                      </button>
                    );
                  })}
                </Column>
              );
            })}

            {/* 定員制クラス列（体幹教室）：予約人数 N/定員 を表示 */}
            {classServices.map((cls) => {
              const ctx: ColCtx = { serviceId: cls.id, canClose: true };
              return (
              <Column
                key={cls.id}
                header={cls.name}
                subHeader={`定員${cls.capacity}名`}
                headerColor={CLASS_COLOR}
                height={height}
                yFor={yFor}
                ticks={ticks}
                offRanges={classOffRanges(cls)}
                closureBands={closures
                  .filter(
                    (c) =>
                      (c.staff_id === null && c.service_id === null) ||
                      c.service_id === cls.id
                  )
                  .map((c) => ({
                    id: c.id,
                    start: c.start_min ?? minMin,
                    end: c.end_min ?? maxMin,
                    reason: c.reason,
                  }))}
                onClosureClick={removeClosure}
                openingBands={classOpeningBands(cls.id)}
                onOpeningClick={removeOpening}
                band={bandFor(ctx)}
                onPointerDownTrack={(e) => beginDrag(ctx, e)}
                onPointerMoveTrack={moveDrag}
                onPointerUpTrack={endDrag}
                onPointerCancelTrack={cancelDrag}
              >
                {classGroups(cls.id).map((g, i) => (
                  <div
                    key={i}
                    className="absolute left-0.5 right-0.5 z-20 overflow-hidden rounded-[4px] px-1 py-1 shadow-sm"
                    style={{
                      top: yFor(g.start),
                      height: yFor(g.end) - yFor(g.start) - 2,
                      backgroundColor: CLASS_COLOR,
                      border: "0.5px solid rgba(255,255,255,.95)",
                    }}
                  >
                    <div className="mb-0.5 text-[11px] font-bold text-white" style={{ textShadow: TEXT_SHADOW }}>
                      {g.list.length}/{cls.capacity}
                      {g.list.length >= cls.capacity && (
                        <span className="ml-1 rounded bg-white/25 px-1 text-[9px] text-white">満</span>
                      )}
                    </div>
                    {g.list.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setModal({ mode: "edit", appt: a })}
                        className="block w-full truncate text-left text-[10px] font-medium text-white hover:underline"
                        style={{ textShadow: TEXT_SHADOW, opacity: a.status === "done" ? 0.6 : 1 }}
                      >
                        {a.patient_name || "（未登録）"}
                        {a.status === "done" && " ✓済"}
                      </button>
                    ))}
                  </div>
                ))}
              </Column>
              );
            })}

          </div>
        </div>
      )}

      {/* ドラッグ後の2択ポップアップ */}
      {pop && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPop(null)} />
          <div
            className="fixed z-50 max-h-[80vh] w-56 -translate-x-1/2 overflow-auto rounded-xl border bg-white p-3 shadow-xl"
            style={{
              left: Math.min(Math.max(pop.x, 130), window.innerWidth - 130),
              // 画面下寄りでタップしたら上向きに出す（見切れ防止）
              ...(pop.y > window.innerHeight * 0.55
                ? { bottom: Math.max(8, window.innerHeight - pop.y + 8) }
                : { top: pop.y + 8 }),
            }}
          >
            <div className="mb-2 text-center text-xs text-slate-500">
              {minToLabel(pop.start)}〜{minToLabel(pop.end)} をどうしますか？
            </div>
            <button
              onClick={() => {
                setModal({
                  mode: "add",
                  staffId: pop.ctx.staffId,
                  serviceId: pop.ctx.serviceId,
                  startMin: pop.start,
                });
                setPop(null);
              }}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white active:bg-blue-700"
            >
              予約を追加
            </button>
            {(pop.ctx.staffId || pop.ctx.serviceId) &&
              (() => {
                const sid = pop.ctx.staffId;
                const svc = pop.ctx.serviceId;
                const overlap = openings.find(
                  (o) =>
                    (sid ? o.staff_id === sid : o.service_id === svc) &&
                    o.start_min < pop.end &&
                    o.end_min > pop.start
                );
                return overlap ? (
                  <button
                    onClick={() => {
                      removeOpening(overlap.id);
                      setPop(null);
                    }}
                    className="mt-2 w-full rounded-lg border border-emerald-300 bg-emerald-50 py-2.5 text-sm font-bold text-emerald-700 active:bg-emerald-100"
                  >
                    予約可能を解除
                  </button>
                ) : (
                  <button
                    onClick={makeOpening}
                    className="mt-2 w-full rounded-lg border border-emerald-500 bg-emerald-500 py-2.5 text-sm font-bold text-white active:bg-emerald-600"
                  >
                    予約可能にする
                  </button>
                );
              })()}
            {pop.ctx.canClose && (
              <button
                onClick={makeClosure}
                className="mt-2 w-full rounded-lg border border-slate-300 py-2.5 text-sm font-bold text-slate-700 active:bg-slate-100"
              >
                休診にする
              </button>
            )}
          </div>
        </>
      )}

      {modal && (
        <AdminBookingModal
          mode={modal.mode}
          appt={modal.mode === "edit" ? modal.appt : undefined}
          initialStaffId={modal.mode === "add" ? modal.staffId : undefined}
          initialServiceId={modal.mode === "add" ? modal.serviceId : undefined}
          initialStartMin={modal.mode === "add" ? modal.startMin : undefined}
          date={date}
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
    </div>
  );
}

function Column({
  header,
  subHeader,
  headerColor,
  height,
  yFor,
  ticks,
  offRanges,
  closureBands,
  onClosureClick,
  openingBands = [],
  onOpeningClick,
  band,
  onPointerDownTrack,
  onPointerMoveTrack,
  onPointerUpTrack,
  onPointerCancelTrack,
  children,
}: {
  header: string;
  subHeader?: string;
  headerColor: string;
  height: number;
  yFor: (m: number) => number;
  ticks: number[];
  offRanges: Array<[number, number]>;
  closureBands: ClosureBand[];
  onClosureClick?: (id: string) => void;
  openingBands?: Opening[];
  onOpeningClick?: (id: string) => void;
  band?: [number, number] | null;
  onPointerDownTrack?: (e: React.PointerEvent) => void;
  onPointerMoveTrack?: (e: React.PointerEvent) => void;
  onPointerUpTrack?: (e: React.PointerEvent) => void;
  onPointerCancelTrack?: (e: React.PointerEvent) => void;
  children: React.ReactNode;
}) {
  const draggable = Boolean(onPointerDownTrack);
  return (
    <div className="min-w-[72px] flex-1 border-r last:border-r-0">
      <div
        className="flex h-8 flex-col items-center justify-center border-b text-xs font-bold text-white"
        style={{ backgroundColor: headerColor }}
      >
        <span>{header}</span>
        {subHeader && <span className="text-[9px] font-normal opacity-80">{subHeader}</span>}
      </div>
      <div className="relative select-none" style={{ height }}>
        {/* 目盛り線 */}
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute left-0 w-full border-t border-slate-100"
            style={{ top: yFor(t) }}
          />
        ))}
        {/* 勤務外グレー */}
        {offRanges.map(([s, e], i) => (
          <div
            key={i}
            className="absolute left-0 w-full bg-slate-200/60"
            style={{ top: yFor(s), height: yFor(e) - yFor(s) }}
          />
        ))}
        {/* ドラッグ用オーバーレイ（空き部分の入力を拾う。カードは z-20 で上） */}
        {draggable && (
          <div
            className="absolute inset-0 z-0"
            style={{ touchAction: "auto" }}
            onPointerDown={onPointerDownTrack}
            onPointerMove={onPointerMoveTrack}
            onPointerUp={onPointerUpTrack}
            onPointerCancel={onPointerCancelTrack}
          />
        )}
        {/* 休診バンド（クリックで解除）*/}
        {closureBands.map((c) => (
          <button
            key={c.id}
            onClick={() => onClosureClick?.(c.id)}
            title="クリックで休診を解除"
            className="absolute left-0 z-10 w-full overflow-hidden border-y border-slate-400/40 bg-slate-400/45 text-[10px] font-bold text-slate-600"
            style={{
              top: yFor(c.start),
              height: yFor(c.end) - yFor(c.start),
              backgroundImage:
                "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(100,116,139,.15) 6px, rgba(100,116,139,.15) 12px)",
            }}
          >
            休診{c.reason ? `・${c.reason}` : ""}
          </button>
        ))}
        {/* 臨時の予約可能枠（クリックで解除）*/}
        {openingBands.map((o) => (
          <button
            key={o.id}
            onClick={() => onOpeningClick?.(o.id)}
            title="クリックで予約可能を解除"
            className="absolute left-0 z-10 flex w-full items-center justify-center overflow-hidden border-y border-emerald-400/50 bg-emerald-400/25 text-[10px] font-bold text-emerald-700"
            style={{
              top: yFor(o.start_min),
              height: yFor(o.end_min) - yFor(o.start_min),
            }}
          >
            予約可
          </button>
        ))}
        {/* 選択バンド */}
        {band && (
          <div
            className="pointer-events-none absolute left-0 z-10 w-full rounded-sm border-2 border-blue-500 bg-blue-500/25"
            style={{
              top: yFor(band[0]),
              height: Math.max(2, yFor(band[1]) - yFor(band[0])),
            }}
          />
        )}
        {children}
      </div>
    </div>
  );
}
