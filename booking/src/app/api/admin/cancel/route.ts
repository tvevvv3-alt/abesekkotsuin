import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildApptInfo, buildCancelText, lineMessagingConfigured, pushText } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 管理者が予約をキャンセル。LINE連携済みの患者にはキャンセル通知を送る。
export async function POST(req: NextRequest) {
  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "auth" }, { status: 401 });

  let appointmentId = "";
  try {
    appointmentId = ((await req.json()) as { appointmentId?: string }).appointmentId || "";
  } catch {
    /* noop */
  }
  if (!appointmentId) return NextResponse.json({ ok: false, reason: "bad" }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, reason: "server" }, { status: 500 });

  const { data: appt } = await admin
    .from("appointments")
    .select("id, line_user_id, status, date, start_min, service_id, staff_id, service_name")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt) return NextResponse.json({ ok: false, reason: "notfound" }, { status: 404 });

  // キャンセル＋枠の解放
  const { error } = await admin.from("appointments").update({ status: "cancelled" }).eq("id", appointmentId);
  if (error) return NextResponse.json({ ok: false, reason: "db", detail: error.message }, { status: 500 });
  await admin.from("appointment_steps").delete().eq("appointment_id", appointmentId);

  // LINE連携済みの患者へキャンセル通知（失敗しても成功扱い）
  let sent = false;
  if (appt.line_user_id && lineMessagingConfigured()) {
    try {
      const { data: cfg } = await admin.from("settings").select("cancel_text, clinics").eq("id", 1).maybeSingle();
      const info = await buildApptInfo(
        admin,
        {
          service_id: appt.service_id ?? null,
          staff_id: appt.staff_id ?? null,
          date: appt.date,
          start_min: appt.start_min,
          service_name: appt.service_name ?? null,
        },
        (cfg?.clinics as never) ?? null
      );
      const r = await pushText(appt.line_user_id, buildCancelText(info, (cfg as { cancel_text?: string | null } | null)?.cancel_text ?? null));
      sent = r.ok;
    } catch {
      /* noop */
    }
  }

  return NextResponse.json({ ok: true, sent, hadLine: !!appt.line_user_id });
}
