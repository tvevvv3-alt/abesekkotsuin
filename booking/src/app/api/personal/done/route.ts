import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_PERSONAL_DONE_TEXT, lineMessagingConfigured, pushText, renderPersonalDone } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// パーソナルの「終了」→ 回数券を消費（30分=1・60分=2）し、本人へお礼＋残り回数をLINE送信。
// 体幹教室の /api/class/done と同じ立て付け。呼び出し前に status=done に更新済み前提。
function consume(a: { start_min: number; end_min: number }): number {
  return Math.max(1, Math.round((a.end_min - a.start_min) / 30));
}

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "auth" }, { status: 401 });

  let appointmentId = "";
  try {
    const b = (await req.json()) as { appointmentId?: string };
    appointmentId = b.appointmentId || "";
  } catch {
    /* noop */
  }
  if (!appointmentId) return NextResponse.json({ ok: false, reason: "noid" }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, reason: "server" }, { status: 500 });

  const { data: appt } = await admin
    .from("appointments")
    .select("id, line_user_id, patient_name, date, start_min, end_min")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt) return NextResponse.json({ ok: false, reason: "noappt" }, { status: 404 });

  // 回数券対象メニュー
  const { data: sv } = await admin.from("services").select("id, personal");
  const pids = ((sv as { id: string; personal: boolean }[] | null) ?? []).filter((s) => s.personal).map((s) => s.id);

  // 終了メッセージのテンプレート
  const { data: cfg } = await admin.from("settings").select("personal_done_text").eq("id", 1).maybeSingle();
  const tpl = (cfg?.personal_done_text as string | null)?.trim() || DEFAULT_PERSONAL_DONE_TEXT;

  // 会員の回数・既使用
  const { data: tk } = await admin
    .from("personal_tickets")
    .select("quota, used_offset")
    .eq("name", appt.patient_name ?? "")
    .limit(1);
  const quota = (tk as { quota: number }[] | null)?.[0]?.quota ?? 10;
  const used = (tk as { used_offset: number }[] | null)?.[0]?.used_offset ?? 0;

  // 終了済み（done）の消費合計（このコマ含む）
  let consumedDone = 0;
  if (pids.length && appt.patient_name) {
    const { data: dones } = await admin
      .from("appointments")
      .select("start_min, end_min")
      .eq("patient_name", appt.patient_name)
      .eq("status", "done")
      .in("service_id", pids);
    consumedDone = ((dones as { start_min: number; end_min: number }[] | null) ?? []).reduce((n, a) => n + consume(a), 0);
  }
  const remaining = Math.max(0, quota - used - consumedDone);

  if (!appt.line_user_id) return NextResponse.json({ ok: false, reason: "noline", remaining });
  if (!lineMessagingConfigured()) return NextResponse.json({ ok: false, reason: "notconfigured", remaining });

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  const bookUrl = liffId ? `https://liff.line.me/${liffId}` : process.env.NEXT_PUBLIC_SITE_URL || "https://abesekkotsuin.vercel.app";
  const text = renderPersonalDone(tpl, { name: appt.patient_name, url: bookUrl, remaining: `あと${remaining}回` });
  const r = await pushText(appt.line_user_id, text);
  return NextResponse.json({ ok: r.ok, remaining, error: r.ok ? undefined : r.error });
}
