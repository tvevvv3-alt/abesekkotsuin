// LINE Messaging API 連携ヘルパー（サーバー専用）
// 送信・メッセージ文面・日時整形をまとめる。
import type { SupabaseClient } from "@supabase/supabase-js";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// Messaging API（プッシュ送信）が使えるか
export function lineMessagingConfigured(): boolean {
  return Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN);
}

// LINEログイン（本人とのひも付け）が使えるか
export function lineLoginConfigured(): boolean {
  return Boolean(
    process.env.LINE_LOGIN_CHANNEL_ID && process.env.LINE_LOGIN_CHANNEL_SECRET
  );
}

// "YYYY-MM-DD" + 分 → "7/23（木）10:00"
export function fmtDateTime(dateStr: string, startMin: number): string {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const dow = new Date(y, m - 1, d).getDay();
  const hh = Math.floor(startMin / 60);
  const mm = startMin % 60;
  return `${m}/${d}（${WEEKDAYS[dow]}）${hh}:${String(mm).padStart(2, "0")}`;
}

export interface ApptInfo {
  clinicName: string;
  serviceName: string;
  dateTime: string; // fmtDateTime 済み
  staffName?: string | null;
  visitTime: string; // "10:00"
}

const CLINIC_LABEL = "阿部接骨院 / Total Recoverytation Abe";

export function buildConfirmText(i: ApptInfo): string {
  const lines = [
    "【ご予約ありがとうございます】",
    "",
    `■院　　：${i.clinicName}`,
    `■メニュー：${i.serviceName}`,
    `■日時　：${i.dateTime}`,
  ];
  if (i.staffName) lines.push(`■担当　：${i.staffName}`);
  lines.push("", "ご来院お待ちしております。", `― ${CLINIC_LABEL}`);
  return lines.join("\n");
}

export function buildReminderText(i: ApptInfo, when: "eve" | "morning"): string {
  const head =
    when === "eve"
      ? "【明日のご予約のお知らせ】"
      : "【本日のご予約のお知らせ】";
  const lines = [
    head,
    "",
    `■院　　：${i.clinicName}`,
    `■メニュー：${i.serviceName}`,
    `■日時　：${i.dateTime}`,
  ];
  if (i.staffName) lines.push(`■担当　：${i.staffName}`);
  lines.push(
    "",
    `ご来院時刻は ${i.visitTime} です。`,
    "ご来院お待ちしております。",
    `― ${CLINIC_LABEL}`
  );
  return lines.join("\n");
}

// 予約行から、メッセージ組み立てに必要な情報を集める。
// clinicsMap を渡すと settings の再取得を省ける（cron のループ用）。
export interface ApptRow {
  service_id: string | null;
  staff_id: string | null;
  date: string;
  start_min: number;
  service_name: string | null;
}
type ClinicsMap =
  | { ibaraki?: { name?: string }; kawanishi?: { name?: string } }
  | null;

export async function buildApptInfo(
  admin: SupabaseClient,
  a: ApptRow,
  clinicsMap?: ClinicsMap
): Promise<ApptInfo> {
  let serviceName = a.service_name || "ご予約";
  let category = "";
  if (a.service_id) {
    const { data } = await admin
      .from("services")
      .select("name, patient_name, category")
      .eq("id", a.service_id)
      .maybeSingle();
    if (data) {
      serviceName = data.patient_name || data.name || serviceName;
      category = data.category || "";
    }
  }
  let staffName: string | null = null;
  if (a.staff_id) {
    const { data } = await admin
      .from("staff")
      .select("name, display_name")
      .eq("id", a.staff_id)
      .maybeSingle();
    if (data) staffName = data.display_name || data.name || null;
  }
  let clinics = clinicsMap;
  if (clinics === undefined) {
    const { data } = await admin
      .from("settings")
      .select("clinics")
      .eq("id", 1)
      .maybeSingle();
    clinics = (data?.clinics as ClinicsMap) ?? null;
  }
  const isKawa = category === "川西整体院";
  const defName = isKawa ? "川西整体院" : "茨木本院";
  const clinicName =
    (isKawa ? clinics?.kawanishi?.name : clinics?.ibaraki?.name)?.trim() ||
    defName;
  const hh = Math.floor(a.start_min / 60);
  const mm = a.start_min % 60;
  return {
    clinicName,
    serviceName,
    dateTime: fmtDateTime(a.date, a.start_min),
    staffName,
    visitTime: `${hh}:${String(mm).padStart(2, "0")}`,
  };
}

// LINE へテキストを1通プッシュ送信
export async function pushText(
  userId: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const token = (process.env.LINE_CHANNEL_ACCESS_TOKEN || "").trim();
  if (!token) return { ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN 未設定" };
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: [{ type: "text", text }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `LINE ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "送信失敗" };
  }
}
