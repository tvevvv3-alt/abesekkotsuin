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

function layoutLanes(items: Item[]): (Item & { lane: number; cols: number; span: number })[] {
  const sorted = [...items].sort((a, b) => a.s - b.s || a.e - b.e);
  const out: (Item & { lane: number; cols: number; span: number })[] = [];
  let cluster: Item[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    // 開始時刻順（同時刻は担当順）で左詰め＝時間の流れが左→右で読みやすい
    const cl = [...cluster].sort((a, b) => a.s - b.s || a.rank - b.rank);
    const laneEnd: number[] = [];
    const placed = cl.map((it) => {
      let lane = laneEnd.findIndex((end) => end <= it.s);
      if (lane === -1) {
        lane = laneEnd.length;
        laneEnd.push(it.e);
      } else laneEnd[lane] = it.e;
      return { ...it, lane, cols: 1, span: 1 };
    });
    // 均等割：同じ重なりグループ内は全員おなじ幅（1/レーン数）。
    // 60分など長い予約はまたがって背が高くなるぶんで区別される。
    const laneCount = laneEnd.length;
    placed.forEach((p) => (p.cols = laneCount));
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

// 基本の並び順：阿部→澁谷→萩原→林→（体幹教室・その他は最後）
function staffOrderKey(name: string): number {
  if (name.includes("阿部")) return 0;
  if (name.includes("澁谷") || name.includes("渋谷")) return 1;
  if (name.includes("萩原")) return 2;
  if (name.includes("林")) return 3;
  return 90;
}

const CLASS_COLOR = "#EF6C00"; // 体幹教室＝オレンジ
const TEXT_SHADOW = "0 1px 1px rgba(0,0,0,.28)"; // 白文字を読みやすくする控えめな影（Google風にシャキッと）

// 表示用の背景色。白文字が読めるよう明るすぎる色は暗くし、通電(light)は少し薄くする。
function segColor(hex: string, tone: "light" | "dark"): string {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  let r = parseInt(n.slice(0, 2), 16);
  let g = parseInt(n.slice(2, 4), 16);
  let b = parseInt(n.slice(4, 6), 16);
  if ([r, g, b].some(isNaN)) return hex;
  // 施術（濃）＝ヘッダーと同じ原色でそろえる
  if (tone === "dark") return `rgb(${r},${g},${b})`;
  // 通電（薄）＝原色を白寄りに薄める（見やすさ優先）
  const a = 0.42;
  r += (255 - r) * a;
  g += (255 - g) * a;
  b += (255 - b) * a;
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

// 工程の色分け：通電＝薄い / 施術＝濃い
function stepTone(st: AppointmentStep): "light" | "dark" {
  if (/通電/.test(st.name)) return "light";
  if (/施術|手技|整体|矯正|マッサージ|検査|カウンセリング/.test(st.name)) return "dark";
  return st.uses_staff ? "dark" : "light";
}

// 予約を「薄い通電 / 濃い施術」のセグメントへ分解。
// 30分グリッドで区切る：通電20分→30分枠(薄)、施術30分(濃)。60分施術のみ→60分ひとつながり。
type Seg = { s: number; e: number; tone: "light" | "dark" };
function apptSegments(a: ApptWithSteps): Seg[] {
  const blockStart = snap(a.start_min);
  const blockEnd = Math.max(snap(a.end_min), blockStart + SNAP);
  const steps = (a.steps ?? [])
    .filter((st) => st.start_min != null && st.end_min != null)
    .sort((x, y) => x.start_min - y.start_min);
  if (steps.length === 0) return [{ s: blockStart, e: blockEnd, tone: "dark" }];
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
  let cursor = blockStart;
  const out: Seg[] = [];
  for (const seg of merged) {
    let end = snap(seg.e);
    if (end <= cursor) end = cursor + SNAP;
    out.push({ s: cursor, e: end, tone: seg.tone });
    cursor = end;
  }
  return out;
}

export default function CalendarView({
  start,
  days,
  onStartChange,
  onDaysChange,
}: {
  start: string;
  days: number;
  onStartChange: (d: string) => void;
  onDaysChange?: (n: number) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<ServiceWithSteps[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [appts, setAppts] = useState<ApptWithSteps[]>([]);
  const [notes, setNotes] = useState<CalendarNote[]>([]);
  const [zoom, setZoom] = useState(1);

  // ---- 予約ブロックのドラッグ移動（長押しで掴む）----
  type DragKind = "move" | "denden";
  type DragState = {
    id: string; kind: DragKind;
    origStart: number; origEnd: number; origDate: string;
    targetStart: number; targetDate: string; dyPx: number;
    onStaff: string | null; // 凡例チップにドロップ中の担当
  };
  const [dragging, setDragging] = useState<DragState | null>(null);
  const latestDragRef = useRef<DragState | null>(null);
  const pressRef = useRef<null | {
    id: string; kind: DragKind; startX: number; startY: number;
    origStart: number; origEnd: number; origDate: string; origStaff: string | null;
    appt: ApptWithSteps; timer: number | null; source: "touch" | "mouse";
  }>(null);
  const dragActiveRef = useRef(false);
  const draggedRef = useRef(false); // ドラッグ直後のクリック（モーダル）を抑止
  const latestXYRef = useRef<{ x: number; y: number } | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const [boxH, setBoxH] = useState(600);
  const pxRef = useRef(1);
  const pendScrollRef = useRef<number | null>(null);
  const didInit = useRef(false);

  // 横スライド（前・今・次の3ページ）：transformを直接操作して滑らかに
  const headerTrackRef = useRef<HTMLDivElement>(null);
  const gridTrackRef = useRef<HTMLDivElement>(null);
  const pendingDir = useRef(0); // アニメ完了後に送る方向（+1/-1）
  const animating = useRef(false);

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
      setStaff(
        st
          .filter((s) => s.admin_visible && s.status !== "retired")
          .sort((a, b) => staffOrderKey(a.name) - staffOrderKey(b.name))
      );
      setServices(sv);
      setEquipment(eq);
      setSettings(se);
    })();
  }, [supabase]);

  // 3ページ分の日付（前・今・次）
  const baseDate = useMemo(() => {
    const [y, m, d] = start.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [start]);
  const makeList = useCallback(
    (offset: number) => Array.from({ length: days }, (_, i) => toDateStr(addDays(baseDate, offset + i))),
    [baseDate, days]
  );
  const lists = useMemo(
    () => [makeList(-days), makeList(0), makeList(days)],
    [makeList, days]
  );
  const allDates = useMemo(() => lists.flat(), [lists]);

  const reload = useCallback(async () => {
    if (allDates.length === 0) return;
    const [{ data: aData }, { data: sData }, nt] = await Promise.all([
      supabase.from("appointments").select("*").in("date", allDates).neq("status", "cancelled"),
      supabase.from("appointment_steps").select("*").in("date", allDates),
      loadCalendarNotes(supabase, allDates),
    ]);
    const stepsByAppt: Record<string, AppointmentStep[]> = {};
    (sData ?? []).forEach((s: AppointmentStep) => {
      (stepsByAppt[s.appointment_id] ||= []).push(s);
    });
    setAppts((aData ?? []).map((a: Appointment) => ({ ...a, steps: stepsByAppt[a.id] || [] })));
    setNotes(nt);
  }, [supabase, allDates]);

  useEffect(() => {
    reload();
  }, [reload]);

  const staffColor = (id: string | null) => staff.find((s) => s.id === id)?.color || "#64748b";
  const staffName = (id: string | null) => staff.find((s) => s.id === id)?.name || "";

  const kawanishiId = useMemo(
    () => services.find((s) => s.category === "川西整体院")?.id ?? null,
    [services]
  );
  const abeColor = useMemo(
    () => staff.find((s) => s.name.includes("阿部"))?.color ?? "#2563eb",
    [staff]
  );
  // 体幹教室（定員制クラス）は担当に関わらずオレンジ
  const classIds = useMemo(
    () => new Set(services.filter((s) => s.capacity > 1).map((s) => s.id)),
    [services]
  );
  const colorFor = (a: ApptWithSteps) =>
    a.service_id === kawanishiId
      ? abeColor
      : classIds.has(a.service_id ?? "")
      ? CLASS_COLOR
      : staffColor(a.staff_id);

  // メモの色パレット：各担当カラー＋体幹＋汎用5色（重複は除外）
  const notePalette = useMemo(() => {
    const staffCols = staff.map((s) => s.color).filter((c): c is string => !!c);
    const extras = [CLASS_COLOR, "#ef4444", "#ec4899", "#14b8a6", "#0ea5e9", "#64748b"];
    return Array.from(new Set([...staffCols, ...extras]));
  }, [staff]);

  const boardStart = settings?.board_start_min ?? 540;
  const boardEnd = Math.max(boardStart + 60, settings?.board_end_min ?? 1290);
  const boardRange = boardEnd - boardStart;

  // グリッド枠の高さを計測
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxH(el.clientHeight || 600));
    ro.observe(el);
    setBoxH(el.clientHeight || 600);
    return () => ro.disconnect();
  }, []);

  const basePx = Math.max(0.15, boxH / boardRange);
  const zoomMin = Math.min(1, Math.max(0.2, boardRange / RANGE));
  const zoomMinRef = useRef(zoomMin);
  zoomMinRef.current = zoomMin;
  const pxPerMin = basePx * zoom;
  pxRef.current = pxPerMin;
  const gridH = RANGE * pxPerMin;
  const yFor = (m: number) => (Math.max(VIEW_START, Math.min(VIEW_END, m)) - VIEW_START) * pxPerMin;

  useEffect(() => {
    setZoom((z) => (z < zoomMin ? zoomMin : z));
  }, [zoomMin]);

  useLayoutEffect(() => {
    if (didInit.current || boxH <= 0) return;
    const el = gridRef.current;
    if (!el) return;
    el.scrollTop = (boardStart - VIEW_START) * pxPerMin;
    didInit.current = true;
  }, [boxH, pxPerMin, boardStart]);

  useLayoutEffect(() => {
    if (pendScrollRef.current != null && gridRef.current) {
      gridRef.current.scrollTop = pendScrollRef.current;
      pendScrollRef.current = null;
    }
  }, [zoom]);

  const zoomAt = useCallback(
    (factor: number, focalClientY: number) => {
      const el = gridRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = pxRef.current;
      const gridY = focalClientY - rect.top + el.scrollTop;
      const t = VIEW_START + gridY / px;
      setZoom((z) => {
        const nz = Math.min(ZOOM_MAX, Math.max(zoomMinRef.current, z * factor));
        const npx = basePx * nz;
        pendScrollRef.current = Math.max(0, (t - VIEW_START) * npx - (focalClientY - rect.top));
        return nz;
      });
    },
    [basePx]
  );
  // 3ページの横トラックを直接操作（React再描画なしで滑らかに）。idx: 0=前/1=今/2=次
  const applyTransform = useCallback((idx: number, px: number, animate: boolean, durMs = 400) => {
    // translate3d でGPU合成にのせてカクつきを防ぐ
    const tf = `translate3d(calc(${(-idx * 100) / 3}% + ${px}px), 0, 0)`;
    // なめらかに減速してスナップ（easeOutQuint 風）。フリック時は短めに。
    const tr = animate ? `transform ${durMs}ms cubic-bezier(.22,1,.36,1)` : "none";
    [headerTrackRef.current, gridTrackRef.current].forEach((el) => {
      if (!el) return;
      el.style.willChange = "transform"; // 操作中だけGPU昇格（常時だと縦スクロールが重くなる）
      el.style.transition = tr;
      el.style.transform = tf;
    });
  }, []);
  // 横操作が終わったらGPU昇格を解除して縦スクロールを軽く保つ
  const clearWillChange = useCallback(() => {
    [headerTrackRef.current, gridTrackRef.current].forEach((el) => {
      if (el) el.style.willChange = "auto";
    });
  }, []);
  // start/days が変わったら中央（今）へ即リセット（＝今日で今日が左端に来る）
  useLayoutEffect(() => {
    applyTransform(1, 0, false);
    animating.current = false;
    pendingDir.current = 0;
  }, [start, days, applyTransform]);

  // ---- ジェスチャ：ピンチ拡大 / 横ドラッグでページ送り ----
  const pinch = useRef<{ dist: number; zoom: number; midY: number } | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    axis: null | "h" | "v";
    lastX: number;
    lastT: number;
    vx: number; // 速度(px/ms)：フリック判定用
  } | null>(null);
  const swipedRef = useRef(false);

  // ---- 予約ブロックのドラッグ移動（長押し→縦で時刻／横で日付／凡例へドロップで担当変更） ----
  const apptById = (id: string) => appts.find((a) => a.id === id);
  const isLightStep = (st: AppointmentStep) => stepTone(st) === "light";
  function cancelPress() {
    const p = pressRef.current;
    if (p?.timer) window.clearTimeout(p.timer);
    pressRef.current = null;
  }
  function activatePress() {
    const p = pressRef.current;
    if (!p) return;
    dragActiveRef.current = true;
    drag.current = null;
    pinch.current = null;
    try { if (navigator.vibrate) navigator.vibrate(8); } catch {}
    const ds: DragState = {
      id: p.id, kind: p.kind, origStart: p.origStart, origEnd: p.origEnd, origDate: p.origDate,
      targetStart: p.origStart, targetDate: p.origDate, dyPx: 0, onStaff: null,
    };
    latestDragRef.current = ds;
    setDragging(ds);
  }
  function beginPress(appt: ApptWithSteps, kind: DragKind, x: number, y: number, source: "touch" | "mouse") {
    cancelPress();
    draggedRef.current = false;
    latestXYRef.current = { x, y };
    pressRef.current = {
      id: appt.id, kind, startX: x, startY: y,
      origStart: appt.start_min, origEnd: appt.end_min, origDate: appt.date, origStaff: appt.staff_id,
      appt, timer: window.setTimeout(activatePress, 240), source,
    };
  }
  function movePress(x: number, y: number) {
    const p = pressRef.current;
    if (!p) return;
    latestXYRef.current = { x, y };
    if (!dragActiveRef.current) {
      if (Math.hypot(x - p.startX, y - p.startY) > 10) cancelPress();
      return;
    }
    const dyPx = y - p.startY;
    if (p.kind === "denden") {
      const ds: DragState = { ...(latestDragRef.current as DragState), dyPx };
      latestDragRef.current = ds;
      setDragging(ds);
      return;
    }
    const px = pxRef.current;
    const dur = p.origEnd - p.origStart;
    const targetStart = Math.max(VIEW_START, Math.min(VIEW_END - dur, snap(p.origStart + dyPx / px)));
    let targetDate = p.origDate;
    const el = gridRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const colW = (rect.width - GUTTER) / days;
      const idx = Math.floor((x - rect.left - GUTTER) / colW);
      const center = lists[1];
      targetDate = center[Math.max(0, Math.min(days - 1, idx))] ?? p.origDate;
    }
    let onStaff: string | null = null;
    const under = document.elementFromPoint(x, y) as HTMLElement | null;
    const chip = under?.closest?.("[data-staff-id]") as HTMLElement | null;
    if (chip) onStaff = chip.getAttribute("data-staff-id");
    const ds: DragState = { id: p.id, kind: "move", origStart: p.origStart, origEnd: p.origEnd, origDate: p.origDate, targetStart, targetDate, dyPx, onStaff };
    latestDragRef.current = ds;
    setDragging(ds);
  }
  function endPress() {
    const p = pressRef.current;
    const wasActive = dragActiveRef.current;
    const dd = latestDragRef.current;
    cancelPress();
    dragActiveRef.current = false;
    setDragging(null);
    latestDragRef.current = null;
    if (!wasActive || !p) return;
    let changed = false;
    if (p.kind === "move" && dd) {
      if (dd.onStaff && dd.onStaff !== p.origStaff) { commitStaff(p.appt, dd.onStaff); changed = true; }
      else if (dd.targetStart !== p.origStart || dd.targetDate !== p.origDate) { commitMove(p.appt, dd.targetStart, dd.targetDate); changed = true; }
    } else if (p.kind === "denden" && dd) {
      if (Math.abs(dd.dyPx / pxRef.current) >= 20) { commitSwap(p.appt); changed = true; }
    }
    draggedRef.current = changed;
  }
  async function commitMove(appt: ApptWithSteps, newStart: number, newDate: string) {
    const delta = newStart - appt.start_min;
    await supabase.from("appointments").update({ start_min: newStart, end_min: appt.end_min + delta, date: newDate }).eq("id", appt.id);
    await Promise.all((appt.steps ?? []).map((st) =>
      supabase.from("appointment_steps").update({ start_min: st.start_min + delta, end_min: st.end_min + delta, date: newDate }).eq("id", st.id)
    ));
    reload();
  }
  async function commitStaff(appt: ApptWithSteps, staffId: string) {
    await supabase.from("appointments").update({ staff_id: staffId }).eq("id", appt.id);
    await Promise.all((appt.steps ?? []).filter((st) => st.uses_staff).map((st) =>
      supabase.from("appointment_steps").update({ staff_id: staffId }).eq("id", st.id)
    ));
    reload();
  }
  async function commitSwap(appt: ApptWithSteps) {
    const steps = [...(appt.steps ?? [])].filter((s) => s.start_min != null && s.end_min != null).sort((a, b) => a.start_min - b.start_min);
    const light = steps.filter(isLightStep);
    const dark = steps.filter((s) => !isLightStep(s));
    if (!light.length || !dark.length) return;
    const lightFirst = light[0].start_min < dark[0].start_min;
    const order = lightFirst ? [...dark, ...light] : [...light, ...dark];
    let cursor = steps[0].start_min;
    const ups = order.map((st) => { const dur = st.end_min - st.start_min; const s = cursor; cursor += dur; return { id: st.id, start_min: s, end_min: cursor }; });
    await Promise.all(ups.map((u) => supabase.from("appointment_steps").update({ start_min: u.start_min, end_min: u.end_min }).eq("id", u.id)));
    if (cursor !== appt.end_min) await supabase.from("appointments").update({ end_min: cursor }).eq("id", appt.id);
    reload();
  }

  function onTouchStart(e: TouchEvent) {
    if (dragActiveRef.current) return;
    if (e.touches.length === 1) {
      const tEl = e.target as HTMLElement;
      const blk = tEl.closest?.("[data-appt-id]") as HTMLElement | null;
      if (blk) {
        const id = blk.getAttribute("data-appt-id");
        const appt = id ? apptById(id) : undefined;
        if (appt) {
          const kind: DragKind = tEl.closest?.("[data-denden]") ? "denden" : "move";
          beginPress(appt, kind, e.touches[0].clientX, e.touches[0].clientY, "touch");
          return;
        }
      }
    }
    if (e.touches.length === 2) {
      drag.current = null;
      const [a, b] = [e.touches[0], e.touches[1]];
      pinch.current = {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        zoom,
        midY: (a.clientY + b.clientY) / 2,
      };
      return;
    }
    if (!animating.current) {
      drag.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        axis: null,
        lastX: e.touches[0].clientX,
        lastT: performance.now(),
        vx: 0,
      };
    }
  }
  function onTouchMove(e: TouchEvent) {
    if (dragActiveRef.current) {
      e.preventDefault();
      const t = e.touches[0];
      movePress(t.clientX, t.clientY);
      return;
    }
    if (pressRef.current) {
      const t = e.touches[0];
      const p = pressRef.current;
      const dx = t.clientX - p.startX;
      const dy = t.clientY - p.startY;
      if (Math.hypot(dx, dy) <= 10) { movePress(t.clientX, t.clientY); return; }
      // 10px超えたら長押しではない：横=ページ送りへ引き継ぎ、縦=ネイティブスクロール
      cancelPress();
      if (Math.abs(dx) > Math.abs(dy) && !animating.current) {
        drag.current = { x: p.startX, y: p.startY, axis: "h", lastX: t.clientX, lastT: performance.now(), vx: 0 };
        // ↓の横ドラッグ処理へフォールスルー
      } else {
        return;
      }
    }
    if (pinch.current && e.touches.length === 2) {
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const target = Math.min(ZOOM_MAX, Math.max(zoomMinRef.current, pinch.current.zoom * (dist / pinch.current.dist)));
      zoomAt(target / zoom, pinch.current.midY);
      return;
    }
    const d = drag.current;
    if (!d) return;
    const t = e.touches[0];
    const dx = t.clientX - d.x;
    const dy = t.clientY - d.y;
    if (d.axis === null) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 5) d.axis = "h";
      else if (Math.abs(dy) > 5) {
        d.axis = "v"; // 縦はネイティブスクロールに任せる
        drag.current = null;
        return;
      } else {
        return; // まだ方向が決まっていない
      }
    }
    if (d.axis === "h") {
      // ネイティブの縦スクロール／ラバーバンドを止めて指に追従（カクつき防止）
      e.preventDefault();
      // 直近の速度を記録（指を離した瞬間の勢いでフリック判定するため）
      const now = performance.now();
      const dt = now - d.lastT;
      if (dt > 0) {
        const inst = (t.clientX - d.lastX) / dt; // px/ms
        d.vx = 0.75 * inst + 0.25 * d.vx; // 平滑化してブレを抑える
        d.lastX = t.clientX;
        d.lastT = now;
      }
      const max = (gridRef.current?.clientWidth || 320) - GUTTER; // 一度に動かせるのは最大1ページ
      applyTransform(1, Math.max(-max, Math.min(max, dx)), false); // 指に追従（再描画なし）
    }
  }
  function onTouchEnd(e: TouchEvent) {
    if (dragActiveRef.current || pressRef.current) {
      endPress();
      return;
    }
    if (pinch.current) {
      if (e.touches.length < 2) pinch.current = null;
      return;
    }
    const d = drag.current;
    drag.current = null;
    if (d && d.axis === "h") {
      const dx = e.changedTouches[0].clientX - d.x;
      if (Math.abs(dx) > 8) swipedRef.current = true;
      const colW = ((gridRef.current?.clientWidth || 320) - GUTTER) / days;
      // 指を離す直前に止まっていたら勢いは無しとみなす（誤フリック防止）
      const idle = performance.now() - d.lastT;
      const vx = idle > 90 ? 0 : d.vx;
      // まずは動かした距離から最寄りの日へスナップ
      let delta = Math.round(-dx / colW);
      // フリック（速く弾いた）ときは、距離が短くてもその方向へ最低1コマ送る
      const FLICK = 0.3; // px/ms（≒300px/s）
      if (Math.abs(vx) > FLICK) {
        if (vx < 0) delta = Math.max(delta, 1); // 左へ弾く＝前へ
        else delta = Math.min(delta, -1); // 右へ弾く＝後ろへ
      }
      delta = Math.max(-days, Math.min(days, delta)); // 一度に動けるのは最大1ページぶん
      animating.current = true;
      // 指を離した勢い(速度)に合わせてアニメ時間を決める → ドラッグから慣性でスッと流れる
      if (delta === 0) {
        const remain = Math.abs(dx);
        const dur = Math.max(50, Math.min(90, remain / Math.max(Math.abs(vx), 3.0)));
        applyTransform(1, 0, true, dur); // 戻し
      } else {
        const targetPx = -delta * colW;
        const remain = Math.abs(targetPx - dx); // 残り距離
        const speed = Math.max(Math.abs(vx), 3.0); // px/ms（ほぼ即切り替え）
        const dur = Math.max(50, Math.min(110, remain / speed));
        pendingDir.current = delta;
        applyTransform(1, targetPx, true, dur); // スナップ先の日へほぼ即切り替え
      }
    }
  }
  // 最新のハンドラを保持（ネイティブリスナーを付け替えずに済むように）
  const touchHandlers = useRef({ onTouchStart, onTouchMove, onTouchEnd });
  touchHandlers.current = { onTouchStart, onTouchMove, onTouchEnd };
  // ネイティブの非パッシブ touchmove を登録（preventDefault を効かせるため）
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ts = (e: TouchEvent) => touchHandlers.current.onTouchStart(e);
    const tm = (e: TouchEvent) => touchHandlers.current.onTouchMove(e);
    const te = (e: TouchEvent) => touchHandlers.current.onTouchEnd(e);
    el.addEventListener("touchstart", ts, { passive: true });
    el.addEventListener("touchmove", tm, { passive: false });
    el.addEventListener("touchend", te, { passive: true });
    el.addEventListener("touchcancel", te, { passive: true });
    return () => {
      el.removeEventListener("touchstart", ts);
      el.removeEventListener("touchmove", tm);
      el.removeEventListener("touchend", te);
      el.removeEventListener("touchcancel", te);
    };
  }, []);
  // スライド完了 → 実データを delta 日ぶん進める（start変更でlayout effectが中央へ即リセット）
  function onSlideEnd(e: React.TransitionEvent) {
    if (e.propertyName !== "transform") return;
    clearWillChange(); // 操作完了 → GPU昇格を解除（縦スクロールを軽く保つ）
    if (pendingDir.current) {
      const d = pendingDir.current;
      pendingDir.current = 0;
      onStartChange(toDateStr(addDays(new Date(start + "T00:00:00"), d)));
    } else {
      animating.current = false;
    }
  }

  const hours: number[] = [];
  for (let t = Math.ceil(VIEW_START / 60) * 60; t <= VIEW_END; t += 60) hours.push(t);
  const todayStr = toDateStr(new Date());

  // 1日カラム
  function renderColumn(ds: string) {
    const items: Item[] = [
      ...appts
        .filter((a) => a.date === ds)
        .map((a): Item => {
          const rk = staff.findIndex((s) => s.id === a.staff_id);
          const segs = apptSegments(a);
          return { kind: "appt", s: segs[0].s, e: segs[segs.length - 1].e, rank: rk === -1 ? 900 : rk, appt: a };
        }),
      ...notes
        .filter((n) => n.date === ds && n.start_min != null)
        .map((n): Item => ({
          kind: "note",
          s: snap(n.start_min as number),
          e: Math.max(snap(n.end_min ?? (n.start_min as number) + SNAP), snap(n.start_min as number) + SNAP),
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
            height: yFor(it.e) - top,
            left: `${(it.lane * 100) / it.cols}%`,
            width: `${(it.span * 100) / it.cols}%`,
          };
          const HAIRLINE = "0.5px solid rgba(255,255,255,.95)"; // 細い白枠
          if (it.kind === "note") {
            const h = yFor(it.e) - top;
            const ml = it.span === it.cols && h >= 40;
            return (
              <button
                key={it.note.id}
                onClick={(ev) => {
                  ev.stopPropagation();
                  setNoteModal({ mode: "edit", note: it.note });
                }}
                className="absolute flex items-center justify-start overflow-hidden rounded-[4px] px-1 text-left"
                style={{ ...style, backgroundColor: segColor(it.note.color || "#64748b", "dark"), border: HAIRLINE }}
              >
                <span
                  className={`${ml ? "overflow-hidden text-[12px] leading-[1.2]" : "w-full overflow-hidden whitespace-nowrap text-[11.5px] leading-[1.15]"} font-normal text-white`}
                  style={{ textShadow: TEXT_SHADOW, wordBreak: ml ? "break-word" : undefined }}
                >
                  {it.note.text}
                  <span className="ml-1 font-normal opacity-90">{minToLabel(it.s)}</span>
                </span>
              </button>
            );
          }
          const a = it.appt;
          const col = colorFor(a);
          const segs = apptSegments(a);
          const done = a.status === "done";
          const hasBoth = segs.some((sg) => sg.tone === "light") && segs.some((sg) => sg.tone === "dark");
          const drg = dragging && dragging.id === a.id ? dragging : null;
          let dragStyle: React.CSSProperties = {};
          if (drg && drg.kind === "move") {
            const center = lists[1];
            const oi = center.indexOf(drg.origDate);
            const ti = center.indexOf(drg.targetDate);
            const gEl = gridRef.current;
            const colW = gEl ? (gEl.getBoundingClientRect().width - GUTTER) / days : 0;
            const dxPx = oi >= 0 && ti >= 0 ? (ti - oi) * colW : 0;
            const dyPx = yFor(drg.targetStart) - yFor(drg.origStart);
            dragStyle = { transform: `translate3d(${dxPx}px, ${dyPx}px, 0)`, zIndex: 60, opacity: 0.92, boxShadow: "0 12px 26px rgba(0,0,0,.3)" };
          }
          return (
            <button
              key={a.id}
              data-appt-id={a.id}
              onClick={(ev) => {
                ev.stopPropagation();
                if (draggedRef.current) { draggedRef.current = false; return; }
                setModal({ mode: "edit", appt: a });
              }}
              onPointerDown={(ev) => {
                if (ev.pointerType !== "mouse" || ev.button !== 0) return;
                const kind: DragKind = (ev.target as HTMLElement).closest?.("[data-denden]") ? "denden" : "move";
                try { (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId); } catch {}
                beginPress(a, kind, ev.clientX, ev.clientY, "mouse");
              }}
              onPointerMove={(ev) => {
                if (ev.pointerType !== "mouse") return;
                if (dragActiveRef.current) ev.preventDefault();
                movePress(ev.clientX, ev.clientY);
              }}
              onPointerUp={(ev) => { if (ev.pointerType === "mouse") endPress(); }}
              className="absolute"
              style={{ ...style, background: "transparent", opacity: done ? 0.5 : undefined, ...dragStyle }}
              title={`${minToLabel(a.start_min)} ${a.patient_name ?? ""}（${staffName(a.staff_id)}）`}
            >
              {done && (
                <span className="absolute right-0.5 top-0.5 z-10 rounded bg-white/90 px-1 text-[9px] font-bold text-slate-600">
                  済
                </span>
              )}
              {drg && drg.kind === "move" && (
                <span className="absolute -top-5 left-0 z-20 whitespace-nowrap rounded bg-slate-900/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {drg.onStaff ? `${staffName(drg.onStaff)}へ` : `${drg.targetDate.slice(5).replace("-", "/")} ${minToLabel(drg.targetStart)}`}
                </span>
              )}
              {segs.map((sg, i) => {
                const segTop = yFor(sg.s) - top;
                const segH = yFor(sg.e) - yFor(sg.s);
                const ml = it.span === it.cols && segH >= 44;
                const isDenden = hasBoth && sg.tone === "light";
                const dendenTf = drg && drg.kind === "denden" && isDenden ? { transform: `translateY(${drg.dyPx}px)`, zIndex: 30, boxShadow: "0 8px 18px rgba(0,0,0,.28)" } : {};
                // 各30分枠を白枠で囲い、通電・施術それぞれに名前を入れる
                return (
                  <div
                    key={i}
                    data-denden={isDenden ? "1" : undefined}
                    className="absolute inset-x-0 flex items-center justify-start overflow-hidden rounded-[4px] px-1 text-left"
                    style={{
                      top: segTop,
                      height: segH,
                      backgroundColor: segColor(col, sg.tone),
                      border: HAIRLINE,
                      ...dendenTf,
                    }}
                  >
                    <span
                      className={`${ml ? "overflow-hidden text-[12px] leading-[1.2]" : "w-full overflow-hidden whitespace-nowrap text-[11.5px] leading-[1.15]"} font-normal text-white`}
                      style={{ textShadow: TEXT_SHADOW, wordBreak: ml ? "break-word" : undefined }}
                    >
                      {a.patient_name || "（未登録）"}
                      <span className="ml-1 font-normal opacity-90">{minToLabel(sg.s)}</span>
                    </span>
                  </div>
                );
              })}
            </button>
          );
        })}
      </div>
    );
  }

  // ヘッダー（日付＋終日メモ帯）1ページ分
  function renderHeaderPanel(list: string[]) {
    return (
      <div style={{ flex: "0 0 100%" }}>
        <div className="flex">
          {list.map((ds) => {
            const dd = new Date(ds + "T00:00:00");
            const isToday = ds === todayStr;
            return (
              <button
                key={ds}
                onClick={() => {
                  onStartChange(ds);
                  if (days > 1) onDaysChange?.(1);
                }}
                title={days > 1 ? "この日だけを表示" : undefined}
                className={`min-w-0 flex-1 border-l py-1 text-center text-xs font-bold active:bg-slate-100 ${
                  isToday ? "text-blue-600" : "text-slate-600"
                }`}
              >
                {dd.getMonth() + 1}/{dd.getDate()}（{WEEKDAY_LABELS[dd.getDay()]}）
              </button>
            );
          })}
        </div>
        <div className="flex bg-slate-50/60">
          {list.map((ds, di) => {
            const allDay = notes.filter((n) => n.start_min == null && n.date <= ds && (n.end_date || n.date) >= ds);
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
                {allDay.map((n) => {
                  const isStart = n.date === ds;
                  const isEnd = (n.end_date || n.date) === ds;
                  const showText = isStart || di === 0; // 開始日、または画面左端で文字表示
                  return (
                    <button
                      key={n.id}
                      onClick={() => setNoteModal({ mode: "edit", note: n })}
                      className={`mb-0.5 block w-full truncate px-1 py-0.5 text-left text-[10px] font-bold text-white ${isStart ? "rounded-l" : ""} ${isEnd ? "rounded-r" : ""}`}
                      style={{ backgroundColor: n.color || "#64748b" }}
                    >
                      {showText ? n.text : " "}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* スタッフ色の凡例（カレンダーは列見出しが日付なので色で担当を判別） */}
      <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        {staff.map((s) => {
          const hot = dragging?.kind === "move";
          const on = dragging?.onStaff === s.id;
          return (
            <span
              key={s.id}
              data-staff-id={s.id}
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 transition ${
                on ? "font-bold text-white" : hot ? "ring-1 ring-slate-300" : ""
              }`}
              style={on ? { backgroundColor: s.color || "#64748b" } : undefined}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: s.color || "#64748b" }}
              />
              {s.name}
            </span>
          );
        })}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CLASS_COLOR }} />
          体幹教室
        </span>
        {kawanishiId && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: abeColor }} />
            川西整体院
          </span>
        )}
      </div>

      {/* カレンダー本体（ツールバーは親のAdminScheduleに統合） */}
      <div className="overflow-hidden rounded-xl border bg-white">
        {/* 固定ヘッダー（横スライド） */}
        <div className="flex border-b">
          <div className="shrink-0 bg-white" style={{ width: GUTTER }} />
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <div ref={headerTrackRef} className="flex" style={{ width: "300%" }}>
              {lists.map((list, i) => (
                <div key={i} style={{ flex: "0 0 33.3333%" }}>
                  {renderHeaderPanel(list)}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 時間グリッド（縦スクロール＋ピンチ／横スライド） */}
        <div
          ref={gridRef}
          className="relative overflow-y-auto overflow-x-hidden overscroll-x-none"
          style={{ height: "calc(100dvh - 190px)", touchAction: "pan-y" }}
        >
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
            {/* 右：3ページの横トラック */}
            <div className="relative min-w-0 flex-1 overflow-hidden" style={{ height: gridH }}>
              <div
                ref={gridTrackRef}
                className="flex"
                style={{ width: "300%", height: gridH }}
                onTransitionEnd={onSlideEnd}
              >
                {lists.map((list, i) => (
                  <div key={i} className="flex" style={{ flex: "0 0 33.3333%", height: gridH }}>
                    {list.map((ds) => renderColumn(ds))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-1.5 text-[11px] text-slate-400">
        空きタップで「予約」か「メモ」。予約を長押し→ドラッグで時刻・日付を変更（凡例へドロップで担当変更）。通電は長押しで前後入れ替え。日付見出しタップでその日だけ表示。
      </p>

      {/* 空きタップ → 予約 or メモ 選択 */}
      {pop && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPop(null)} />
          <div
            className="fixed z-50 max-h-[80vh] w-44 -translate-x-1/2 overflow-auto rounded-xl border bg-white p-2 shadow-xl"
            style={{
              left: Math.min(Math.max(pop.x, 100), window.innerWidth - 100),
              ...(pop.y > window.innerHeight * 0.55
                ? { bottom: Math.max(8, window.innerHeight - pop.y + 6) }
                : { top: pop.y + 6 }),
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
          palette={notePalette}
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
  palette,
  onClose,
  onDone,
}: {
  supabase: ReturnType<typeof createClient>;
  data:
    | { mode: "add"; date: string; allDay: boolean; startMin: number }
    | { mode: "edit"; note: CalendarNote };
  palette: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const colors = palette.length ? palette : NOTE_COLORS;
  const editing = data.mode === "edit" ? data.note : null;
  const [text, setText] = useState(editing?.text ?? "");
  const [color, setColor] = useState(editing?.color ?? colors[0]);
  const allDay = editing ? editing.start_min == null : data.mode === "add" && data.allDay;
  const initStart = editing?.start_min ?? (data.mode === "add" ? data.startMin : 600);
  const [startMin, setStartMin] = useState<number>(initStart ?? 600);
  const [endMin, setEndMin] = useState<number>(editing?.end_min ?? (initStart ?? 600) + 60);
  const [busy, setBusy] = useState(false);
  // 繰り返し（追加時のみ）：なし/毎日/毎週/毎月 × 回数ぶん行を作成
  const [repeat, setRepeat] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [count, setCount] = useState(4);
  const date = editing?.date ?? (data.mode === "add" ? data.date : "");
  const [endDate, setEndDate] = useState<string>(editing?.end_date ?? date);

  async function save() {
    if (!text.trim()) return;
    setBusy(true);
    const row = {
      date,
      end_date: allDay && endDate && endDate > date ? endDate : null,
      text: text.trim(),
      color,
      start_min: allDay ? null : startMin,
      end_min: allDay ? null : Math.max(endMin, startMin + 15),
    };
    if (editing) {
      await supabase.from("calendar_notes").update(row).eq("id", editing.id);
    } else if (repeat !== "none") {
      // 繰り返し：回数ぶんの日付に同じメモを作成
      const base = new Date(date + "T00:00:00");
      const n = Math.max(1, Math.min(60, count));
      const rows = Array.from({ length: n }, (_, i) => {
        let d: Date;
        if (repeat === "daily") d = addDays(base, i);
        else if (repeat === "weekly") d = addDays(base, i * 7);
        else {
          d = new Date(base);
          d.setMonth(d.getMonth() + i);
        }
        return { ...row, date: toDateStr(d) };
      });
      await supabase.from("calendar_notes").insert(rows);
    } else {
      await supabase.from("calendar_notes").insert(row);
    }
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
        {allDay && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="text-[13px]">📅 期間</span>
            <span className="rounded-md border bg-slate-50 px-2 py-1 text-sm text-slate-500">{date.slice(5).replace("-", "/")}</span>
            <span>〜</span>
            <input type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value || date)} className="rounded-md border px-2 py-1 text-sm" />
            <span className="text-[11px] text-slate-400">（複数日は終了日を指定）</span>
          </div>
        )}
        <div className="mb-3 flex flex-wrap gap-2">
          {colors.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`h-7 w-7 rounded-full ${color === c ? "ring-2 ring-offset-2 ring-slate-500" : ""}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        {!editing && (
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-600">
            <span className="text-[13px]">🔁 繰り返し</span>
            <select
              value={repeat}
              onChange={(e) => setRepeat(e.target.value as typeof repeat)}
              className="rounded-md border px-2 py-1 text-sm"
            >
              <option value="none">なし</option>
              <option value="daily">毎日</option>
              <option value="weekly">毎週</option>
              <option value="monthly">毎月</option>
            </select>
            {repeat !== "none" && (
              <>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value || "1", 10))}
                  className="w-16 rounded-md border px-2 py-1 text-sm"
                />
                <span className="text-xs text-slate-400">回</span>
              </>
            )}
          </div>
        )}
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
