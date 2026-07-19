import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildApptInfo,
  buildConfirmText,
  lineMessagingConfigured,
  pushText,
} from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// LIFF（LINE内ブラウザ）から取得した id_token を検証し、予約に userId をひも付ける。
// リッチメニュー経由の来訪者はここでタップ0回のまま自動連携される。
export async function POST(req: NextRequest) {
  const ok = (body: object, status = 200) => NextResponse.json(body, { status });
  let appointmentId = "";
  let idToken = "";
  try {
    const b = (await req.json()) as { appointmentId?: string; idToken?: string };
    appointmentId = b.appointmentId || "";
    idToken = b.idToken || "";
  } catch {
    return ok({ ok: false, error: "bad request" }, 400);
  }
  if (!appointmentId || !idToken) return ok({ ok: false, error: "bad request" }, 400);

  const clientId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!clientId) return ok({ ok: false, error: "not configured" });

  // id_token を LINE で検証（署名・aud・exp を確認して sub を得る）
  const vr = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: clientId }),
  });
  if (!vr.ok) return ok({ ok: false, error: "verify failed" });
  const claims = (await vr.json()) as { sub?: string };
  const userId = claims.sub;
  if (!userId) return ok({ ok: false, error: "no sub" });

  const admin = createAdminClient();
  if (!admin) return ok({ ok: false, error: "server" });

  const { data: appt } = await admin
    .from("appointments")
    .select("id, service_id, staff_id, date, start_min, service_name, confirm_sent_at")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt) return ok({ ok: false, error: "no appt" });

  await admin
    .from("appointments")
    .update({ line_user_id: userId })
    .eq("id", appointmentId);

  // 予約確認メッセージ（未送信のときだけ）
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
  return ok({ ok: true });
}
