import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyState } from "@/lib/line-state";
import { getBaseUrl } from "@/lib/url";
import {
  buildApptInfo,
  buildConfirmText,
  lineMessagingConfigured,
  pushText,
} from "@/lib/line";

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

  const admin = createAdminClient();
  if (!admin) return done("?error=server");

  const { data: appt } = await admin
    .from("appointments")
    .select("id, service_id, staff_id, date, start_min, service_name, confirm_sent_at")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt) return done("?error=noappt");

  await admin
    .from("appointments")
    .update({ line_user_id: userId })
    .eq("id", appointmentId);

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
