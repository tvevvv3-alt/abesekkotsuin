import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/url";
import { DEFAULT_APPLICATION_TEXT, lineMessagingConfigured, maybeAutoSendApplication, pushText, renderLinkMessage, resolveLineUserId } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 診断用：なぜ申込書が自動送信されないかを、実ロジックそのまま（送信はしない）で返す。
//   GET /api/admin/send-application?debug=1&name=患者氏名   （または &a=予約ID）
//   ログイン必須。結果の reason が送られない理由。
const REASON_HELP: Record<string, string> = {
  "would-send": "判定OK。本来ここで自動送信されます（＝自動送信の条件は満たしています）。",
  off: "設定『申込書を自動送信する』がOFFです。",
  nourl: "送信先URLが用意できません（アプリ内OFFかつGoogleフォーム未登録）。",
  notconfigured: "LINEメッセージ送信（Messaging API）が未設定です。",
  notclass: "この予約が体幹教室メニューとして判定されていません（メニューの定員が2以上か、カテゴリ『体幹教室』か、名前に『体幹』を含める必要があります）。",
  noline: "この患者がLINE未連携です（氏名一致の連携済み予約も見つかりません）。",
  notfirst: "この人には過去に体幹教室の予約があり『初回ではない』ため自動送信されません（手動送信ボタンを使ってください）。",
  already: "この予約は既に申込書を送信済みです（application_sent_at が設定済み）。",
};

export async function GET(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "auth" }, { status: 401 });
  if (req.nextUrl.searchParams.get("debug") !== "1") return NextResponse.json({ ok: false, reason: "notfound" }, { status: 404 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, reason: "server" }, { status: 500 });

  const aId = (req.nextUrl.searchParams.get("a") || "").trim();
  const name = (req.nextUrl.searchParams.get("name") || "").trim();
  let q = admin
    .from("appointments")
    .select("id, line_user_id, patient_id, patient_name, service_id, service_name, date, application_sent_at")
    .order("date", { ascending: false })
    .limit(1);
  if (aId) q = admin.from("appointments").select("id, line_user_id, patient_id, patient_name, service_id, service_name, date, application_sent_at").eq("id", aId).limit(1);
  else if (name) q = q.eq("patient_name", name);
  const { data: rows } = await q;
  const appt = (rows as Record<string, unknown>[] | null)?.[0];
  if (!appt) return NextResponse.json({ ok: false, reason: "notfound", hint: "?name=患者氏名 または ?a=予約ID を付けてください" }, { status: 404 });

  const base = getBaseUrl(req).replace(/\/$/, "");
  const verdict = await maybeAutoSendApplication(admin, {
    id: appt.id as string,
    patient_id: (appt.patient_id as string | null) ?? null,
    patient_name: (appt.patient_name as string | null) ?? null,
    line_user_id: (appt.line_user_id as string | null) ?? null,
    date: appt.date as string,
    service_id: (appt.service_id as string | null) ?? null,
    application_sent_at: (appt.application_sent_at as string | null) ?? null,
  }, base, { dryRun: true });

  return NextResponse.json({
    ok: true,
    appointment: {
      id: appt.id, patient_name: appt.patient_name, service_name: appt.service_name,
      service_id: appt.service_id, date: appt.date,
      line_linked: !!appt.line_user_id, application_sent_at: appt.application_sent_at,
    },
    reason: verdict.reason,
    meaning: REASON_HELP[verdict.reason ?? ""] ?? verdict.reason,
  });
}

// 管理者が、予約の患者（LINE連携済み）へ体幹教室の申込書リンクを1タップで送る。
export async function POST(req: NextRequest) {
  // 管理者ログイン確認
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "auth" }, { status: 401 });

  let appointmentId = "";
  let preview = false;
  let overrideText = "";
  try {
    const b = (await req.json()) as { appointmentId?: string; preview?: boolean; text?: string };
    appointmentId = b.appointmentId || "";
    preview = !!b.preview;
    overrideText = (b.text || "").toString();
  } catch { /* noop */ }
  if (!appointmentId) return NextResponse.json({ ok: false, reason: "bad" }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, reason: "server" }, { status: 500 });

  const { data: appt } = await admin.from("appointments").select("id, line_user_id, patient_id, patient_name").eq("id", appointmentId).maybeSingle();
  if (!appt) return NextResponse.json({ ok: false, reason: "notfound" }, { status: 404 });
  const lineId = await resolveLineUserId(admin, appt);
  if (!lineId) return NextResponse.json({ ok: false, reason: "noline" });

  const { data: s } = await admin.from("settings").select("class_application_text").eq("id", 1).maybeSingle();
  // 申込書はアプリ内フォームのみ
  const siteBase = getBaseUrl(req).replace(/\/$/, "");
  const url = `${siteBase}/application?a=${appointmentId}`;
  if (!lineMessagingConfigured()) return NextResponse.json({ ok: false, reason: "notconfigured" });

  const tpl = (s?.class_application_text as string | null)?.trim() || DEFAULT_APPLICATION_TEXT;
  const text = overrideText.trim() ? overrideText : renderLinkMessage(tpl, url);
  if (preview) return NextResponse.json({ ok: true, preview: text });
  const r = await pushText(lineId, text);
  if (!r.ok) return NextResponse.json({ ok: false, reason: "send", error: r.error });
  return NextResponse.json({ ok: true });
}
