import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildApptInfo,
  DEFAULT_CONFIRM_TEXT,
  lineMessagingConfigured,
  pushText,
  renderMessage,
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
  if (!userId) return ok({ ok: false, stage: "verify", error: "no sub" });

  const admin = createAdminClient();
  if (!admin) return ok({ ok: false, stage: "admin", error: "service role 未設定" });

  const { data: appt, error: apptErr } = await admin
    .from("appointments")
    .select("id, service_id, staff_id, date, start_min, service_name, confirm_sent_at")
    .eq("id", appointmentId)
    .maybeSingle();
  if (apptErr) return ok({ ok: false, stage: "select", error: apptErr.message });
  if (!appt) return ok({ ok: false, stage: "select", error: "予約が見つかりません" });

  const { error: upErr } = await admin
    .from("appointments")
    .update({ line_user_id: userId })
    .eq("id", appointmentId);
  if (upErr) return ok({ ok: false, stage: "update", error: upErr.message });

  // 予約確認メッセージ（未送信のときだけ）
  if (!lineMessagingConfigured()) {
    return ok({ ok: true, linked: true, sent: false, stage: "push", error: "アクセストークン未設定" });
  }
  if (appt.confirm_sent_at) {
    return ok({ ok: true, linked: true, sent: false, error: "already sent" });
  }
  const { data: s } = await admin
    .from("settings")
    .select("clinics, confirm_text")
    .eq("id", 1)
    .maybeSingle();
  const info = await buildApptInfo(admin, appt, (s?.clinics as never) ?? null);
  const tpl = s?.confirm_text?.trim() || DEFAULT_CONFIRM_TEXT;
  const r = await pushText(userId, renderMessage(tpl, info));
  if (r.ok) {
    await admin
      .from("appointments")
      .update({ confirm_sent_at: new Date().toISOString() })
      .eq("id", appointmentId);
    return ok({ ok: true, linked: true, sent: true });
  }
  return ok({ ok: true, linked: true, sent: false, stage: "push", error: r.error });
}
