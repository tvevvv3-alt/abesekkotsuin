import { NextRequest, NextResponse } from "next/server";
import { lineLoginConfigured } from "@/lib/line";
import { signState } from "@/lib/line-state";
import { getBaseUrl } from "@/lib/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 予約完了画面の「LINEで受け取る」から呼ばれ、LINEログインへリダイレクトする。
export async function GET(req: NextRequest) {
  const base = getBaseUrl(req);
  if (!lineLoginConfigured()) {
    return NextResponse.redirect(`${base}/line/done?error=notconfigured`);
  }
  const appointmentId = req.nextUrl.searchParams.get("a");
  if (!appointmentId) {
    return NextResponse.redirect(`${base}/line/done?error=noappt`);
  }
  const redirectUri = `${base}/api/line/callback`;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINE_LOGIN_CHANNEL_ID!,
    redirect_uri: redirectUri,
    state: signState(appointmentId),
    scope: "openid profile",
    bot_prompt: "aggressive", // 友だち未追加なら追加を促す
  });
  return NextResponse.redirect(
    `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`
  );
}
