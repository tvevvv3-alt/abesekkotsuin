import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lineMessagingConfigured, pushText } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 管理者が、予約の患者（LINE連携済み）へ体幹教室の申込書リンクを1タップで送る。
export async function POST(req: NextRequest) {
  // 管理者ログイン確認
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "auth" }, { status: 401 });

  let appointmentId = "";
  try { appointmentId = ((await req.json()) as { appointmentId?: string }).appointmentId || ""; } catch { /* noop */ }
  if (!appointmentId) return NextResponse.json({ ok: false, reason: "bad" }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, reason: "server" }, { status: 500 });

  const { data: appt } = await admin.from("appointments").select("id, line_user_id, patient_name").eq("id", appointmentId).maybeSingle();
  if (!appt) return NextResponse.json({ ok: false, reason: "notfound" }, { status: 404 });
  if (!appt.line_user_id) return NextResponse.json({ ok: false, reason: "noline" });

  const { data: s } = await admin.from("settings").select("class_application_url").eq("id", 1).maybeSingle();
  const url = (s?.class_application_url as string | null)?.trim();
  if (!url) return NextResponse.json({ ok: false, reason: "nourl" });
  if (!lineMessagingConfigured()) return NextResponse.json({ ok: false, reason: "notconfigured" });

  const text = `【体幹教室 申込書のお願い】\n下記より体幹教室の申込書のご記入をお願いいたします。\n${url}`;
  const r = await pushText(appt.line_user_id, text);
  if (!r.ok) return NextResponse.json({ ok: false, reason: "send", error: r.error });
  return NextResponse.json({ ok: true });
}
