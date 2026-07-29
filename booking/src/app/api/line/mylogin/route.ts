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
  const clientId = process.env.LINE_LOGIN_CHANNEL_ID || "";
  const redirectUri = `${base}/api/line/callback`;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state: signState("my"),
    scope: "openid profile",
  });
  const authorizeUrl = `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`;
  // 診断用：?probe=1。getBaseUrl版と、ハードコード期待値版で authorize を叩いて比較。
  if (req.nextUrl.searchParams.get("probe") === "1") {
    const EXPECT = "https://abesekkotsuin.vercel.app/api/line/callback";
    const tryUri = async (uri: string) => {
      const p = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: uri, state: signState("my"), scope: "openid profile" });
      try {
        const resp = await fetch(`https://access.line.me/oauth2/v2.1/authorize?${p.toString()}`, { redirect: "manual" });
        return { status: resp.status, location: resp.headers.get("location") };
      } catch (e) {
        return { error: String(e).slice(0, 200) };
      }
    };
    const [dynamic, hardcoded] = await Promise.all([tryUri(redirectUri), tryUri(EXPECT)]);
    return NextResponse.json({
      match_expected: redirectUri === EXPECT,
      redirect_uri_len: redirectUri.length,
      expect_len: EXPECT.length,
      client_id: clientId,
      dynamic_result: dynamic,   // getBaseUrl由来
      hardcoded_result: hardcoded, // 期待値固定
    });
  }
  // 診断用：?debug=1 で送信内容を確認（channel IDは非機密）
  if (req.nextUrl.searchParams.get("debug") === "1") {
    return NextResponse.json({
      base,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_id_set: Boolean(clientId),
      scope: "openid profile",
      authorizeUrl,
    });
  }
  return NextResponse.redirect(authorizeUrl);
}
