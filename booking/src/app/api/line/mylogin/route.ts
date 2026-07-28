import { NextRequest, NextResponse } from "next/server";
import { lineLoginConfigured } from "@/lib/line";
import { signState } from "@/lib/line-state";
import { getBaseUrl } from "@/lib/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 予約確認ページ（/my）用のLINEログイン。予約に紐付かない本人確認。
// 予約フローと同じ redirect_uri（/api/line/callback）を使うので追加登録不要。
export async function GET(req: NextRequest) {
  const base = getBaseUrl(req);
  if (!lineLoginConfigured()) {
    return NextResponse.redirect(`${base}/my?e=notconfigured`);
  }
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINE_LOGIN_CHANNEL_ID || "",
    redirect_uri: `${base}/api/line/callback`,
    state: signState("my"),
    scope: "openid profile",
  });
  return NextResponse.redirect(`https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`);
}
