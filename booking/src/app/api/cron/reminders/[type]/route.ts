import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildApptInfo, buildReminderText, pushText, type ApptRow } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// JST基準の日付文字列（offsetDays日後）
function jstDateStr(offsetDays: number): string {
  const t = Date.now() + 9 * 3600 * 1000 + offsetDays * 86400 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

// Vercel Cron から叩かれるリマインド送信。
//   /api/cron/reminders/eve      … 前日の夜に実行 → 翌日分
//   /api/cron/reminders/morning  … 当日の朝に実行 → 当日分
export async function GET(
  req: NextRequest,
  { params }: { params: { type: string } }
) {
  // Vercel Cron は CRON_SECRET を Bearer で付与する
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const type = params.type === "morning" ? "morning" : "eve";
  const targetDate = type === "eve" ? jstDateStr(1) : jstDateStr(0);
  const col = type === "eve" ? "reminder_eve_sent_at" : "reminder_morning_sent_at";

  const admin = createAdminClient();
  if (!admin)
    return NextResponse.json({ ok: false, error: "no service role" }, { status: 500 });

  const { data: settings } = await admin
    .from("settings")
    .select("clinics")
    .eq("id", 1)
    .maybeSingle();
  const clinics = (settings?.clinics as Parameters<typeof buildApptInfo>[2]) ?? null;

  const { data: appts, error } = await admin
    .from("appointments")
    .select("id, service_id, staff_id, date, start_min, service_name, line_user_id")
    .eq("date", targetDate)
    .eq("status", "booked")
    .not("line_user_id", "is", null)
    .is(col, null);
  if (error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const a of appts ?? []) {
    const info = await buildApptInfo(admin, a as ApptRow, clinics);
    const r = await pushText(a.line_user_id as string, buildReminderText(info, type));
    if (r.ok) {
      sent++;
      await admin
        .from("appointments")
        .update({ [col]: new Date().toISOString() })
        .eq("id", a.id);
    } else {
      failed++;
    }
  }
  return NextResponse.json({
    ok: true,
    type,
    targetDate,
    count: appts?.length ?? 0,
    sent,
    failed,
  });
}
