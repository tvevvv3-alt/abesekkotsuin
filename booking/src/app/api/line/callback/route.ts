import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signState, verifyState } from "@/lib/line-state";
import { getBaseUrl } from "@/lib/url";
import {
  buildApptInfo,
  buildConfirmText,
  fmtDateTime,
  lineMessagingConfigured,
  maybeAutoSendApplication,
  maybeAutoSendQuestionnaire,
  pushText,
} from "@/lib/line";
import { notifyStaff } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// LINEログインのコールバック。userId を予約にひも付け、確認メッセージを送る。
export async function GET(req: NextRequest) {
  const base = getBaseUrl(req);
  const done = (q: string) => NextResponse.redirect(`${base}/line/done${q}`);

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) return done("?error=cancel");
  const appointmentId = verifyState(state);
  if (!appointmentId) return done("?error=badstate");

  // 認可コード → トークン
  const redirectUri = `${base}/api/line/callback`;
  const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: process.env.LINE_LOGIN_CHANNEL_ID || "",
      client_secret: process.env.LINE_LOGIN_CHANNEL_SECRET || "",
    }),
  });
  if (!tokenRes.ok) return done("?error=token");
  const token = (await tokenRes.json()) as { id_token?: string };
  if (!token.id_token) return done("?error=noid");

  // id_token(JWT) の payload から userId(sub) を取り出す
  let userId = "";
  try {
    const payloadPart = token.id_token.split(".")[1];
    const payload = JSON.parse(
      Buffer.from(payloadPart, "base64").toString("utf8")
    ) as { sub?: string };
    userId = payload.sub || "";
  } catch {
    return done("?error=decode");
  }
  if (!userId) return done("?error=nouser");

  // 「予約確認ページ（/my）」用ログイン：予約に紐付けず、本人Cookieを発行して /my へ
  if (appointmentId === "my") {
    const res = NextResponse.redirect(`${base}/my`);
    res.cookies.set("line_uid", signState(userId), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  }

  const admin = createAdminClient();
  if (!admin) return done("?error=server");

  const { data: appt } = await admin
    .from("appointments")
    .select("id, service_id, staff_id, date, start_min, service_name, patient_id, patient_name, confirm_sent_at, questionnaire_sent_at, application_sent_at")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt) return done("?error=noappt");

  await admin
    .from("appointments")
    .update({ line_user_id: userId })
    .eq("id", appointmentId);

  // 問診票の自動送信（初診 or 前回来院から一定日数あいた場合。設定ONのときのみ）
  try {
    await maybeAutoSendQuestionnaire(admin, {
      id: appointmentId,
      patient_id: (appt as { patient_id?: string | null }).patient_id ?? null,
      patient_name: appt.patient_name,
      line_user_id: userId,
      date: appt.date,
      questionnaire_sent_at: (appt as { questionnaire_sent_at?: string | null }).questionnaire_sent_at ?? null,
    });
  } catch { /* 自動送信の失敗で連携は止めない */ }

  // 体幹教室 申込書の自動送信（初めての体幹予約・設定ONのときのみ）
  try {
    await maybeAutoSendApplication(admin, {
      id: appointmentId,
      patient_id: (appt as { patient_id?: string | null }).patient_id ?? null,
      patient_name: appt.patient_name,
      line_user_id: userId,
      date: appt.date,
      service_id: appt.service_id ?? null,
      application_sent_at: (appt as { application_sent_at?: string | null }).application_sent_at ?? null,
    });
  } catch { /* 自動送信の失敗で連携は止めない */ }

  // 運営端末へプッシュ（初回連携＝新規予約のときだけ）
  if (!appt.confirm_sent_at) {
    const info = await buildApptInfo(admin, appt);
    await notifyStaff(admin, {
      title: "🆕 新規予約（LINE）",
      body: `${fmtDateTime(appt.date, appt.start_min)}\n${appt.patient_name ?? ""}様\n${info.serviceName}${info.staffName ? `／担当 ${info.staffName}` : ""}`,
      url: "/admin",
      tag: "appt-" + appointmentId,
    });
  }

  // 確認メッセージ（未送信のときだけ）
  if (lineMessagingConfigured() && !appt.confirm_sent_at) {
    const info = await buildApptInfo(admin, appt);
    const r = await pushText(userId, buildConfirmText(info));
    if (r.ok) {
      await admin
        .from("appointments")
        .update({ confirm_sent_at: new Date().toISOString() })
        .eq("id", appointmentId);
    }
  }
  return done("?ok=1");
}
