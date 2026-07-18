// Supabase からの読み込みヘルパー（患者予約・管理画面 共通）
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppointmentStep,
  BookingWindow,
  BusinessHours,
  Closure,
  Equipment,
  ServicePrice,
  ServiceWithSteps,
  Settings,
  Staff,
  StaffSchedule,
} from "./types";

// 営業時間の既定（月〜土 10:00-13:00 / 16:00-20:30、日曜休み）
function defaultBusinessHours(): BusinessHours[] {
  return [0, 1, 2, 3, 4, 5, 6].map((wd) =>
    wd === 0
      ? { weekday: 0, is_open: false, seg1_start: null, seg1_end: null, seg2_start: null, seg2_end: null }
      : { weekday: wd, is_open: true, seg1_start: 600, seg1_end: 780, seg2_start: 960, seg2_end: 1230 }
  );
}

// 営業時間の基本形（未設定・テーブル未作成なら既定を返す）
export async function loadBusinessHours(sb: SupabaseClient): Promise<BusinessHours[]> {
  const { data, error } = await sb.from("business_hours").select("*").order("weekday");
  // テーブル未作成（マイグレーション前）でも画面が落ちないよう既定へフォールバック
  if (error || !data || data.length === 0) return defaultBusinessHours();
  // 欠けている曜日は既定で補完
  const base = defaultBusinessHours();
  const byWd = new Map(data.map((r: BusinessHours) => [r.weekday, r]));
  return base.map((d) => (byWd.get(d.weekday) as BusinessHours) ?? d);
}

export async function loadServices(
  sb: SupabaseClient
): Promise<ServiceWithSteps[]> {
  const { data, error } = await sb
    .from("services")
    .select("*, steps:service_steps(*)")
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((s: ServiceWithSteps) => ({
    ...s,
    steps: [...(s.steps ?? [])].sort((a, b) => a.step_order - b.step_order),
  }));
}

// 管理のメニュー管理用：非公開も含めた全件
export async function loadAllServices(
  sb: SupabaseClient
): Promise<ServiceWithSteps[]> {
  const { data, error } = await sb
    .from("services")
    .select("*, steps:service_steps(*)")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((s: ServiceWithSteps) => ({
    ...s,
    steps: [...(s.steps ?? [])].sort((a, b) => a.step_order - b.step_order),
  }));
}

export async function loadStaff(
  sb: SupabaseClient,
  bookableOnly = true
): Promise<Staff[]> {
  let q = sb.from("staff").select("*").eq("active", true).order("sort_order");
  if (bookableOnly) q = q.eq("bookable", true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// 管理画面のスタッフ管理用：非表示・退職も含めた全件
export async function loadAllStaff(sb: SupabaseClient): Promise<Staff[]> {
  const { data, error } = await sb
    .from("staff")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

// スタッフ×メニュー 対応表
export async function loadStaffServices(
  sb: SupabaseClient
): Promise<{ staff_id: string; service_id: string }[]> {
  const { data, error } = await sb.from("staff_services").select("staff_id, service_id");
  if (error) throw error;
  return data ?? [];
}

// 料金（スタッフ別・初診/再診）
export async function loadServicePrices(sb: SupabaseClient): Promise<ServicePrice[]> {
  const { data, error } = await sb.from("service_prices").select("*");
  if (error) throw error;
  return data ?? [];
}

// 予約 基本設定（1行。無ければ既定値）
export async function loadSettings(sb: SupabaseClient): Promise<Settings> {
  const { data } = await sb.from("settings").select("*").eq("id", 1).maybeSingle();
  const defaults: Settings = {
    id: 1,
    slot_unit: 30,
    same_day_ok: true,
    last_accept_min: null,
    cancel_deadline_hours: 0,
    change_deadline_hours: 0,
    autofill: true,
    recheck_on_book: true,
    board_start_min: 600,
    board_end_min: 1320,
    logo_url: null,
  };
  if (!data) return defaults;
  // 移行前で列が無い場合も既定で補完
  return {
    ...defaults,
    ...data,
    board_start_min: data.board_start_min ?? defaults.board_start_min,
    board_end_min: data.board_end_min ?? defaults.board_end_min,
    logo_url: data.logo_url ?? null,
  };
}

// 予約公開設定（月別）
export async function loadBookingWindows(
  sb: SupabaseClient
): Promise<BookingWindow[]> {
  const { data, error } = await sb
    .from("booking_windows")
    .select("*")
    .order("year_month");
  if (error) throw error;
  return data ?? [];
}

export async function loadEquipment(sb: SupabaseClient): Promise<Equipment[]> {
  const { data, error } = await sb
    .from("equipment")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function loadSchedules(
  sb: SupabaseClient,
  staffId?: string
): Promise<StaffSchedule[]> {
  let q = sb.from("staff_schedules").select("*");
  if (staffId) q = q.eq("staff_id", staffId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function loadClosures(
  sb: SupabaseClient,
  dates: string[]
): Promise<Closure[]> {
  if (dates.length === 0) return [];
  const { data, error } = await sb
    .from("closures")
    .select("*")
    .in("date", dates);
  if (error) throw error;
  return data ?? [];
}

export async function loadAppointmentSteps(
  sb: SupabaseClient,
  dates: string[]
): Promise<AppointmentStep[]> {
  if (dates.length === 0) return [];
  const { data, error } = await sb
    .from("appointment_steps")
    .select("*")
    .in("date", dates);
  if (error) throw error;
  return data ?? [];
}
