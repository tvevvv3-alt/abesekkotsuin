// =====================================================================
//  工程(Step)単位の予約可否判定エンジン（クライアント側／カレンダー描画用）
//
//  ★ 本システムの中核。
//    ・担当者の空き と 機器の空き を "別々に" 集計し、組み合わせて可否を出す。
//    ・時刻はすべて「0時からの分(minutes)」で扱う（内部5分単位）。
//    ・表示は 30分単位、判定は 5分単位。20分工程にも対応。
//
//  サーバ側（Supabase の check_booking_availability / book_appointment）と
//  同じロジックを実装しているが、最終確定は必ずサーバRPCで再判定するため、
//  ここでの判定はあくまで "カレンダー表示用の目安" として使う。
// =====================================================================

import type {
  AppointmentStep,
  Closure,
  Equipment,
  ServiceStep,
  StaffSchedule,
} from "./types";

// ---- 時刻ユーティリティ -------------------------------------------

export const DAY_MS = 24 * 60 * 60 * 1000;

/** 分 → "HH:MM" */
export function minToLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "HH:MM" → 分 */
export function labelToMin(label: string): number {
  const [h, m] = label.split(":").map((n) => parseInt(n, 10));
  return h * 60 + m;
}

/** Date → "YYYY-MM-DD"（ローカル） */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DD" → Date（ローカル正午。TZずれ回避） */
export function fromDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** その週の月曜日を返す */
export function startOfWeek(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = r.getDay(); // 0=日
  const diff = dow === 0 ? -6 : 1 - dow; // 月曜起点
  r.setDate(r.getDate() + diff);
  return r;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

// ---- 工程展開 ------------------------------------------------------

export interface StepInterval {
  step: ServiceStep;
  start: number;
  end: number;
}

/** メニューの工程を、来院時刻 startMin から時系列に展開する */
export function expandSteps(
  steps: ServiceStep[],
  startMin: number
): StepInterval[] {
  const ordered = [...steps].sort((a, b) => a.step_order - b.step_order);
  const out: StepInterval[] = [];
  let cursor = startMin;
  for (const step of ordered) {
    out.push({ step, start: cursor, end: cursor + step.duration_min });
    cursor += step.duration_min;
  }
  return out;
}

/** メニュー全体の所要時間（分） */
export function totalDuration(steps: ServiceStep[]): number {
  return steps.reduce((sum, s) => sum + s.duration_min, 0);
}

// 2区間 [a,b) [c,d) が重なるか
function overlap(a: number, b: number, c: number, d: number): boolean {
  return a < d && c < b;
}

// ---- 判定に必要なデータ束 ------------------------------------------

export interface DayContext {
  date: string; // YYYY-MM-DD
  weekday: number; // 0=日..6=土
  // 当該担当者の当日勤務枠
  schedules: StaffSchedule[];
  // 当日の休診（院全体 or 当該担当者）
  closures: Closure[];
  // 当該担当者の当日 担当者占有ステップ
  staffSteps: AppointmentStep[];
  // 当日の機器占有ステップ（equipment_id 別）
  equipmentSteps: AppointmentStep[];
  // 機器定員
  equipmentById: Record<string, Equipment>;
}

export interface AvailabilityResult {
  ok: boolean;
  reason?: string;
  endMin?: number;
}

/**
 * ★ 予約可否判定（1つの候補時刻に対して）
 *   条件: ①担当者の空き ②機器の空き ③勤務時間内 ④非休診 ⑤重複なし
 *   excludeAppointmentId: 予約変更時に自分自身を除外
 */
export function checkAvailability(
  serviceSteps: ServiceStep[],
  staffId: string,
  startMin: number,
  ctx: DayContext,
  excludeAppointmentId?: string
): AvailabilityResult {
  if (serviceSteps.length === 0) return { ok: false, reason: "工程なし" };

  const intervals = expandSteps(serviceSteps, startMin);
  const endMin = intervals[intervals.length - 1].end;

  // ③ 勤務時間内（予約全体が1つの勤務枠に収まること）
  const inShift = ctx.schedules.some(
    (s) => s.start_min <= startMin && s.end_min >= endMin
  );
  if (!inShift) return { ok: false, reason: "勤務時間外" };

  // ④ 休診（院全体 or 当該担当者。終日 or 時間帯）
  for (const c of ctx.closures) {
    if (c.staff_id !== null && c.staff_id !== staffId) continue;
    const allDay = c.start_min === null;
    if (
      allDay ||
      overlap(c.start_min as number, c.end_min as number, startMin, endMin)
    ) {
      return { ok: false, reason: "休診" };
    }
  }

  // 工程ごとに担当者/機器を別々に判定
  for (const iv of intervals) {
    // ① 担当者を使う工程：担当者が空いているか
    if (iv.step.uses_staff) {
      const busy = ctx.staffSteps.some(
        (a) =>
          a.staff_id === staffId &&
          a.appointment_id !== excludeAppointmentId &&
          overlap(a.start_min, a.end_min, iv.start, iv.end)
      );
      if (busy) return { ok: false, reason: "担当者の空きなし" };
    }

    // ② 機器を使う工程：同時利用人数が定員未満か
    if (iv.step.equipment_id) {
      const cap = ctx.equipmentById[iv.step.equipment_id]?.capacity ?? 1;
      const used = ctx.equipmentSteps
        .filter(
          (a) =>
            a.equipment_id === iv.step.equipment_id &&
            a.appointment_id !== excludeAppointmentId &&
            overlap(a.start_min, a.end_min, iv.start, iv.end)
        )
        .reduce((sum, a) => sum + a.headcount, 0);
      if (used + iv.step.headcount > cap) {
        return { ok: false, reason: "機器の空きなし" };
      }
    }
  }

  return { ok: true, endMin };
}

// ---- 定員制クラス（体幹教室など）----------------------------------

export interface ClassSlotResult {
  state: "off" | "closed" | "full" | "ok";
  remaining: number; // 残り人数
  used: number; // 予約済み人数
  capacity: number;
}

/**
 * 定員制クラスの1コマの状態を返す。
 *  ・担当者には紐づかない（営業時間＝いずれかの担当者が勤務している時間）
 *  ・院全体休診のみ考慮
 *  ・同時刻の同一メニュー予約人数で 残N / 満 を判定
 */
export function classSlot(
  serviceId: string,
  capacity: number,
  serviceSteps: ServiceStep[],
  startMin: number,
  allSchedules: StaffSchedule[], // その曜日の全担当者分
  closures: Closure[], // その日の休診
  classSteps: AppointmentStep[], // その日の当該クラスの工程
  excludeAppointmentId?: string
): ClassSlotResult {
  const endMin = startMin + totalDuration(serviceSteps);
  const inOpen = allSchedules.some(
    (s) => s.start_min <= startMin && s.end_min >= endMin
  );
  if (!inOpen) return { state: "off", remaining: capacity, used: 0, capacity };

  const closed = closures.some(
    (c) =>
      c.staff_id === null &&
      (c.start_min === null ||
        overlap(c.start_min, c.end_min as number, startMin, endMin))
  );
  if (closed) return { state: "closed", remaining: 0, used: 0, capacity };

  // 重複するコマの予約人数（同一メニューは1予約=1工程）
  const ids = new Set<string>();
  for (const a of classSteps) {
    if (a.service_id !== serviceId) continue;
    if (a.appointment_id === excludeAppointmentId) continue;
    if (overlap(a.start_min, a.end_min, startMin, endMin)) ids.add(a.appointment_id);
  }
  const used = ids.size;
  const remaining = Math.max(0, capacity - used);
  return { state: remaining > 0 ? "ok" : "full", remaining, used, capacity };
}

export const isClassService = (capacity: number) => capacity > 1;

/**
 * 1日の勤務枠から、表示用の候補開始時刻(30分刻み)を列挙する。
 * メニュー所要時間が枠内に収まる開始時刻のみを返す。
 */
export function candidateStarts(
  schedules: StaffSchedule[],
  duration: number,
  stepMin = 30
): number[] {
  const set = new Set<number>();
  for (const s of schedules) {
    // 30分グリッドに乗せた開始候補
    const first = Math.ceil(s.start_min / stepMin) * stepMin;
    for (let t = first; t + duration <= s.end_min; t += stepMin) {
      set.add(t);
    }
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * 週表示のための「時間行」を、勤務枠の最小開始〜最大終了から生成（30分刻み）。
 */
export function timeRows(
  allSchedules: StaffSchedule[],
  stepMin = 30
): number[] {
  if (allSchedules.length === 0) return [];
  const min = Math.min(...allSchedules.map((s) => s.start_min));
  const max = Math.max(...allSchedules.map((s) => s.end_min));
  const start = Math.floor(min / stepMin) * stepMin;
  const rows: number[] = [];
  for (let t = start; t < max; t += stepMin) rows.push(t);
  return rows;
}
