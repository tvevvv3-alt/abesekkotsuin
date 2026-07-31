import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildApptInfo,
  DEFAULT_CONFIRM_TEXT,
  lineMessagingConfigured,
  pushText,
  renderMessage,
  verifyLineUser,
} from "@/lib/line";
import { verifyState } from "@/lib/line-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /my からの「日時を変更」で取り直した新規予約を、本人（line_uid Cookie
// もしくはLIFF idToken）にひも付け、変更後の確認メッセージを送る。
export async function POST(req: NextRequest) {
  let idToken = "";
  let appointmentId = "";
  try {
    const b = (await req.json()) as { idToken?: string; appointmentId?: string };
    idToken = b.idToken || "";
    appointmentId = b.appointmentId || "";
  } catch {
    /* noop */
  }
  if (!appointmentId) return NextResponse.json({ ok: false, reason: "bad" }, { status: 400 });

  // 本人特定：Cookie優先、無ければ idToken
  const cookieUid = (() => { const c = req.cookies.get("line_uid")?.value; return c ? verifyState(c) : null; })();
  const userId = cookieUid || (idToken ? await verifyLineUser(idToken) : null);
  if (!userId) return NextResponse.json({ ok: false, reason: "auth" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, reason: "server" }, { status: 500 });

  const { data: appt } = await admin
    .from("appointments")
    .select("id, service_id, staff_id, date, start_min, service_name, confirm_sent_at")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt) return NextResponse.json({ ok: false, reason: "notfound" }, { status: 404 });

  await admin.from("appointments").update({ line_user_id: userId }).eq("id", appointmentId);

  if (!lineMessagingConfigured()) return NextResponse.json({ ok: true, sent: false });
  if (appt.confirm_sent_at) return NextResponse.json({ ok: true, sent: false });

  const { data: s } = await admin
    .from("settings")
    .select("clinics, confirm_text")
    .eq("id", 1)
    .maybeSingle();
  const info = await buildApptInfo(admin, appt, (s?.clinics as never) ?? null);
  const tpl = s?.confirm_text?.trim() || DEFAULT_CONFIRM_TEXT;
  const r = await pushText(userId, renderMessage(tpl, info));
  if (r.ok) {
    await admin.from("appointments").update({ confirm_sent_at: new Date().toISOString() }).eq("id", appointmentId);
    return NextResponse.json({ ok: true, sent: true });
  }
  return NextResponse.json({ ok: true, sent: false });
}
