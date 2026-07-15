// Supabase からの読み込みヘルパー（患者予約・管理画面 共通）
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppointmentStep,
  Closure,
  Equipment,
  ServicePrice,
  ServiceWithSteps,
  Staff,
  StaffSchedule,
} from "./types";

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
