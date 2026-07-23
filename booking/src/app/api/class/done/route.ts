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
    .select("id, line_user_id, patient_name, service_id, date, start_min")
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

  // 今月の来場回数（何回目）を算出：同じ氏名・同じクラス・同月の予約を並べて順番を数える
  const monthStart = appt.date.slice(0, 8) + "01"; // YYYY-MM-01
  const [y, m] = appt.date.split("-").map(Number);
  const monthEnd = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  let nth = 1;
  if (appt.patient_name && appt.service_id) {
    const { data: month } = await admin
      .from("appointments")
      .select("id, date, start_min")
      .eq("service_id", appt.service_id)
      .eq("patient_name", appt.patient_name)
      .neq("status", "cancelled")
      .gte("date", monthStart)
      .lt("date", monthEnd)
      .order("date")
      .order("start_min");
    const idx = (month ?? []).findIndex((r) => r.id === appt.id);
    nth = idx >= 0 ? idx + 1 : (month?.length ?? 0) || 1;
  }

  // パス種別（会員テーブル。未登録は月4回）
  let remaining = "";
  if (appt.patient_name) {
    const { data: mem } = await admin
      .from("class_members")
      .select("pass_type, quota")
      .eq("name", appt.patient_name)
      .maybeSingle();
    if (mem?.pass_type === "free") remaining = "フリーパス";
    else {
      const quota = mem?.quota ?? 4;
      remaining = `あと${Math.max(0, quota - nth)}回`;
    }
  }
  const visitDate = `${m}月${Number(appt.date.slice(8, 10))}日`;

  // 設定でテンプレートを上書き可能（未設定なら既定）
  const { data: st } = await admin
    .from("settings")
    .select("class_done_text")
    .eq("id", 1)
    .maybeSingle();
  const tpl = (st?.class_done_text as string | null)?.trim() || DEFAULT_CLASS_DONE_TEXT;
  const text = renderClassDone(tpl, {
    name: appt.patient_name,
    url: bookUrl,
    visitDate,
    nth,
    remaining,
  });

  const r = await pushText(appt.line_user_id, text);
  if (!r.ok) return NextResponse.json({ ok: false, reason: "send", error: r.error });
  return NextResponse.json({ ok: true });
}
