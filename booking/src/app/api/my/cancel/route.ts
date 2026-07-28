import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyLineUser, lineMessagingConfigured, pushText, fmtDateTime } from "@/lib/line";
import { verifyState } from "@/lib/line-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 本人（LINE）が自分の予約をキャンセル。締切時間内なら不可。工程も削除して枠を解放。
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

  const cookieUid = (() => { const c = req.cookies.get("line_uid")?.value; return c ? verifyState(c) : null; })();
  const userId = cookieUid || (idToken ? await verifyLineUser(idToken) : null);
  if (!userId) return NextResponse.json({ ok: false, reason: "auth" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, reason: "server" }, { status: 500 });

  const { data: appt } = await admin
    .from("appointments")
    .select("id, line_user_id, status, date, start_min, service_name")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt) return NextResponse.json({ ok: false, reason: "notfound" }, { status: 404 });
  if (appt.line_user_id !== userId) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  if (appt.status !== "booked") return NextResponse.json({ ok: false, reason: "already" });

  // 締切チェック（設定のキャンセル締切時間）
  const { data: cfg } = await admin.from("settings").select("cancel_deadline_hours").eq("id", 1).maybeSingle();
  const cancelH = (cfg as { cancel_deadline_hours?: number } | null)?.cancel_deadline_hours ?? 0;
  const hh = String(Math.floor(appt.start_min / 60)).padStart(2, "0");
  const mm = String(appt.start_min % 60).padStart(2, "0");
  const apptMs = Date.parse(`${appt.date}T${hh}:${mm}:00+09:00`);
  const hoursUntil = (apptMs - Date.now()) / 3_600_000;
  if (hoursUntil < cancelH) {
    return NextResponse.json({ ok: false, reason: "deadline", cancelDeadlineHours: cancelH });
  }

  const { error } = await admin.from("appointments").update({ status: "cancelled" }).eq("id", appointmentId);
  if (error) return NextResponse.json({ ok: false, reason: "db", detail: error.message }, { status: 500 });
  await admin.from("appointment_steps").delete().eq("appointment_id", appointmentId);

  // 本人へキャンセル確認をLINE通知（任意・失敗しても成功扱い）
  if (lineMessagingConfigured()) {
    try {
      await pushText(userId, `【キャンセル完了】\n${fmtDateTime(appt.date, appt.start_min)}\n${appt.service_name || ""}\nのご予約をキャンセルしました。またのご利用をお待ちしております。`);
    } catch {
      /* noop */
    }
  }

  return NextResponse.json({ ok: true });
}
