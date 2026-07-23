import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_CLASS_DONE_TEXT,
  lineMessagingConfigured,
  pushText,
  renderClassDone,
} from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 体幹教室の「終了」→ 参加者へお礼＋次回予約案内をLINE送信する。
export async function POST(req: NextRequest) {
  let appointmentId = "";
  try {
    const body = (await req.json()) as { appointmentId?: string };
    appointmentId = body.appointmentId || "";
  } catch {
    /* noop */
  }
  if (!appointmentId) {
    return NextResponse.json({ ok: false, reason: "noid" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, reason: "server" }, { status: 500 });

  const { data: appt } = await admin
    .from("appointments")
    .select("id, line_user_id, patient_name")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt) return NextResponse.json({ ok: false, reason: "noappt" }, { status: 404 });
  if (!appt.line_user_id) {
    return NextResponse.json({ ok: false, reason: "noline" });
  }
  if (!lineMessagingConfigured()) {
    return NextResponse.json({ ok: false, reason: "notconfigured" });
  }

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  const bookUrl = liffId
    ? `https://liff.line.me/${liffId}`
    : process.env.NEXT_PUBLIC_SITE_URL || "https://abesekkotsuin.vercel.app";

  // 設定でテンプレートを上書き可能（未設定なら既定）
  const { data: st } = await admin
    .from("settings")
    .select("class_done_text")
    .eq("id", 1)
    .maybeSingle();
  const tpl = (st?.class_done_text as string | null)?.trim() || DEFAULT_CLASS_DONE_TEXT;
  const text = renderClassDone(tpl, { name: appt.patient_name, url: bookUrl });

  const r = await pushText(appt.line_user_id, text);
  if (!r.ok) return NextResponse.json({ ok: false, reason: "send", error: r.error });
  return NextResponse.json({ ok: true });
}
