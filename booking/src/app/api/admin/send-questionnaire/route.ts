import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_QUESTIONNAIRE_TEXT, lineMessagingConfigured, pushText, renderLinkMessage } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 管理者が、予約の患者（LINE連携済み）へ問診票リンクを1タップで送る。
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

  const { data: appt } = await admin.from("appointments").select("id, line_user_id, patient_name").eq("id", appointmentId).maybeSingle();
  if (!appt) return NextResponse.json({ ok: false, reason: "notfound" }, { status: 404 });
  if (!appt.line_user_id) return NextResponse.json({ ok: false, reason: "noline" });

  const { data: s } = await admin.from("settings").select("questionnaire_url, questionnaire_text").eq("id", 1).maybeSingle();
  const url = (s?.questionnaire_url as string | null)?.trim();
  if (!url) return NextResponse.json({ ok: false, reason: "nourl" });
  if (!lineMessagingConfigured()) return NextResponse.json({ ok: false, reason: "notconfigured" });

  const tpl = (s?.questionnaire_text as string | null)?.trim() || DEFAULT_QUESTIONNAIRE_TEXT;
  const text = overrideText.trim() ? overrideText : renderLinkMessage(tpl, url);
  // プレビュー：送信せず本文だけ返す
  if (preview) return NextResponse.json({ ok: true, preview: text });
  const r = await pushText(appt.line_user_id, text);
  if (!r.ok) return NextResponse.json({ ok: false, reason: "send", error: r.error });
  // 送信日時を記録（モーダルの「送信済」表示・二重送信防止用）
  const sentAt = new Date().toISOString();
  await admin.from("appointments").update({ questionnaire_sent_at: sentAt }).eq("id", appointmentId);
  return NextResponse.json({ ok: true, sentAt });
}
