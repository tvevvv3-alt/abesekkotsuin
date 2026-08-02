import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyLineUser, lineMessagingConfigured, pushText, buildApptInfo, buildCancelText, fmtDateTime } from "@/lib/line";
import { verifyState } from "@/lib/line-state";
import { notifyStaff } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 本人（LINE）が自分の予約をキャンセル。締切時間内なら不可。工程も削除して枠を解放。
export async function POST(req: NextRequest) {
  let idToken = "";
  let appointmentId = "";
  let silent = false; // 変更（リスケ）での旧予約取消はキャンセル通知を出さない
  try {
    const b = (await req.json()) as { idToken?: string; appointmentId?: string; silent?: boolean };
    idToken = b.idToken || "";
    appointmentId = b.appointmentId || "";
    silent = Boolean(b.silent);
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
    .select("id, line_user_id, status, date, start_min, service_name, service_id, staff_id, patient_name")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt) return NextResponse.json({ ok: false, reason: "notfound" }, { status: 404 });
  if (appt.line_user_id !== userId) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  if (appt.status !== "booked") return NextResponse.json({ ok: false, reason: "already" });

  // 締切チェック（設定のキャンセル締切時間）＋キャンセル完了メッセージ本文
  const { data: cfg } = await admin.from("settings").select("cancel_deadline_hours, cancel_text").eq("id", 1).maybeSingle();
  const cancelH = (cfg as { cancel_deadline_hours?: number } | null)?.cancel_deadline_hours ?? 0;
  const cancelTpl = (cfg as { cancel_text?: string | null } | null)?.cancel_text ?? null;
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

  // 運営端末へプッシュ通知（リスケの旧予約取消=silent は出さない）
  if (!silent) {
    await notifyStaff(admin, {
      title: "❌ キャンセル（LINE）",
      body: `${fmtDateTime(appt.date, appt.start_min)}\n${appt.patient_name ?? ""}様\n${appt.service_name ?? ""}`,
      url: "/admin",
      tag: "appt-" + appointmentId,
    });
  }

  // 本人へキャンセル確認をLINE通知（任意・失敗しても成功扱い）。silent時は送らない。
  if (!silent && lineMessagingConfigured()) {
    try {
      const info = await buildApptInfo(admin, {
        service_id: appt.service_id ?? null,
        staff_id: appt.staff_id ?? null,
        date: appt.date,
        start_min: appt.start_min,
        service_name: appt.service_name ?? null,
      });
      await pushText(userId, buildCancelText(info, cancelTpl));
    } catch {
      /* noop */
    }
  }

  return NextResponse.json({ ok: true });
}
