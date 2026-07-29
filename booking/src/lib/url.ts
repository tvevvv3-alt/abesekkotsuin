import type { NextRequest } from "next/server";

// 外部から見たベースURL（LINEのredirect_uri組み立て用）。
// 環境変数 NEXT_PUBLIC_SITE_URL を最優先（登録済みredirect_uriと確実に一致させるため）。
export function getBaseUrl(req: NextRequest): string {
  // 実際にアクセスされているホストを最優先（登録済み redirect_uri と確実に一致させる）。
  // 環境変数が誤った値だと redirect_uri 不一致で LINE が 400 になるため、req のホストを使う。
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (host && host.trim()) {
    const proto = req.headers.get("x-forwarded-proto") || "https";
    return `${proto}://${host.trim()}`;
  }
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env && env.trim()) {
    let u = env.trim().replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(u)) u = "https://" + u.replace(/^\/+/, "");
    return u;
  }
  return "https://abesekkotsuin.vercel.app";
}
