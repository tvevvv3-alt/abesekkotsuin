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

// 差し込みタグ付きの既定テンプレート（管理画面で上書き可能）
export const DEFAULT_CONFIRM_TEXT = [
  "【ご予約ありがとうございます】",
  "",
  "■院　　：{院}",
  "■メニュー：{メニュー}",
  "■日時　：{日時}",
  "■担当　：{担当}",
  "",
  "ご来院お待ちしております。",
  `― ${CLINIC_LABEL}`,
].join("\n");

export const DEFAULT_EVE_TEXT = [
  "【明日のご予約のお知らせ】",
  "",
  "■院　　：{院}",
  "■メニュー：{メニュー}",
  "■日時　：{日時}",
  "■担当　：{担当}",
  "",
  "ご来院時刻は {来院時刻} です。",
  "ご来院お待ちしております。",
  `― ${CLINIC_LABEL}`,
].join("\n");

export const DEFAULT_MORNING_TEXT = DEFAULT_EVE_TEXT.replace(
  "【明日のご予約のお知らせ】",
  "【本日のご予約のお知らせ】"
);

// 体幹教室「終了」時に送るお礼メッセージの既定テンプレート（管理画面で上書き可能）
export const DEFAULT_CLASS_DONE_TEXT = [
  "本日は体幹教室へのご参加ありがとうございました！（{来場日}）",
  "今月 {回数}回目・{残り}",
  "",
  "またのお越しをお待ちしております。",
  "次回のご予約はこちら↓",
  "{予約URL}",
].join("\n");

// 体幹教室の終了メッセージにタグを差し込む
// {名前}=患者名 / {予約URL}=予約リンク / {来場日}=M月D日 / {回数}=今月何回目 / {残り}=あとN回 or フリーパス
export function renderClassDone(
  tpl: string,
  vals: {
    name?: string | null;
    url: string;
    visitDate?: string;
    nth?: number;
    remaining?: string;
  }
): string {
  return tpl
    .split("{名前}").join((vals.name ?? "").trim())
    .split("{予約URL}").join(vals.url)
    .split("{来場日}").join(vals.visitDate ?? "")
    .split("{回数}").join(vals.nth != null ? String(vals.nth) : "")
    .split("{残り}").join(vals.remaining ?? "");
}

// テンプレートに予約情報を差し込む。値が空の「ラベル：」行は自動で消す。
export function renderMessage(tpl: string, i: ApptInfo): string {
  const out = tpl
    .split("{院}").join(i.clinicName)
    .split("{メニュー}").join(i.serviceName)
    .split("{日時}").join(i.dateTime)
    .split("{担当}").join(i.staffName || "")
    .split("{来院時刻}").join(i.visitTime);
  // 「■担当　：」のように値が空になったラベル行を削除
  return out
    .split("\n")
    .filter((line) => !/^[^：\n]*：\s*$/.test(line))
    .join("\n");
}

export function buildConfirmText(i: ApptInfo): string {
  return renderMessage(DEFAULT_CONFIRM_TEXT, i);
}

export function buildReminderText(i: ApptInfo, when: "eve" | "morning"): string {
  return renderMessage(when === "eve" ? DEFAULT_EVE_TEXT : DEFAULT_MORNING_TEXT, i);
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
