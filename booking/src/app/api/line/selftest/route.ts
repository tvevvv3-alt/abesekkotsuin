import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 環境変数のトークンが有効か、LINEに直接問い合わせて確認する診断用。
// ?key=<CRON_SECRET> で保護。トークンの中身は返さない（長さと先頭/末尾のみ）。
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const raw = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
  const token = raw.trim();
  const info: Record<string, unknown> = {
    tokenPresent: Boolean(raw),
    tokenLength: raw.length,
    trimmedLength: token.length,
    hadWhitespace: raw.length !== token.length,
    head: token.slice(0, 6),
    tail: token.slice(-4),
    loginChannelId: process.env.LINE_LOGIN_CHANNEL_ID || null,
    liffId: process.env.NEXT_PUBLIC_LIFF_ID || null,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || null,
    serviceRolePresent: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
  // LINEにトークンの有効性を問い合わせ（Bot情報の取得を試す）
  try {
    const r = await fetch("https://api.line.me/v2/bot/info", {
      headers: { Authorization: `Bearer ${token}` },
    });
    info.botInfoStatus = r.status;
    info.botInfoBody = await r.text();
  } catch (e) {
    info.botInfoError = e instanceof Error ? e.message : "err";
  }
  return NextResponse.json(info);
}
