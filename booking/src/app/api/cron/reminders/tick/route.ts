import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildApptInfo,
  DEFAULT_EVE_TEXT,
  DEFAULT_MORNING_TEXT,
  pushText,
  renderMessage,
  type ApptRow,
} from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// JST基準の日付文字列（offsetDays日後）と現在の「時」
function jstNow() {
  const t = new Date(Date.now() + 9 * 3600 * 1000);
  return { hour: t.getUTCHours(), dateForOffset: (off: number) => new Date(t.getTime() + off * 86400 * 1000).toISOString().slice(0, 10) };
}

// 毎時実行され、設定の時刻に一致した種類のリマインドを送る。
//   認証: Vercel Cron の Bearer CRON_SECRET、または ?key=CRON_SECRET（手動テスト用）
//   ?force=eve / morning で時刻ゲートを無視して即送信（テスト用）
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const bearer = req.headers.get("authorization") === `Bearer ${secret}`;
  const keyOk = req.nextUrl.searchParams.get("key") === secret;
  if (!secret || (!bearer && !keyOk)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const force = req.nextUrl.searchParams.get("force"); // "eve" | "morning" | null

  const admin = createAdminClient();
  if (!admin)
    return NextResponse.json({ ok: false, error: "no service role" }, { status: 500 });

  const { data: s } = await admin
    .from("settings")
    .select(
      "clinics, remind_eve_enabled, remind_eve_hour, remind_eve_text, remind_morning_enabled, remind_morning_hour, remind_morning_text"
    )
    .eq("id", 1)
    .maybeSingle();
  const clinics = (s?.clinics as Parameters<typeof buildApptInfo>[2]) ?? null;
  const { hour, dateForOffset } = jstNow();

  const jobs: Array<{
    kind: "eve" | "morning";
    date: string;
    col: string;
    tpl: string;
  }> = [];

  const eveEnabled = s?.remind_eve_enabled ?? true;
  const eveHour = s?.remind_eve_hour ?? 18;
  if (eveEnabled && (force === "eve" || (!force && hour === eveHour))) {
    jobs.push({
      kind: "eve",
      date: dateForOffset(1), // 翌日分
      col: "reminder_eve_sent_at",
      tpl: s?.remind_eve_text?.trim() || DEFAULT_EVE_TEXT,
    });
  }
  const mEnabled = s?.remind_morning_enabled ?? true;
  const mHour = s?.remind_morning_hour ?? 9;
  if (mEnabled && (force === "morning" || (!force && hour === mHour))) {
    jobs.push({
      kind: "morning",
      date: dateForOffset(0), // 当日分
      col: "reminder_morning_sent_at",
      tpl: s?.remind_morning_text?.trim() || DEFAULT_MORNING_TEXT,
    });
  }

  const summary: Record<string, unknown> = { ok: true, jstHour: hour, ran: [] };
  for (const job of jobs) {
    const { data: appts } = await admin
      .from("appointments")
      .select("id, service_id, staff_id, date, start_min, service_name, line_user_id")
      .eq("date", job.date)
      .eq("status", "booked")
      .not("line_user_id", "is", null)
      .is(job.col, null);
    let sent = 0;
    let failed = 0;
    for (const a of appts ?? []) {
      const info = await buildApptInfo(admin, a as ApptRow, clinics);
      const r = await pushText(a.line_user_id as string, renderMessage(job.tpl, info));
      if (r.ok) {
        sent++;
        await admin.from("appointments").update({ [job.col]: new Date().toISOString() }).eq("id", a.id);
      } else {
        failed++;
      }
    }
    (summary.ran as unknown[]).push({ kind: job.kind, date: job.date, count: appts?.length ?? 0, sent, failed });
  }
  return NextResponse.json(summary);
}
