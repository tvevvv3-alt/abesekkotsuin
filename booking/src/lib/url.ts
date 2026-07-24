import type { NextRequest } from "next/server";

// 外部から見たベースURL（LINEのredirect_uri組み立て用）。
// 環境変数 NEXT_PUBLIC_SITE_URL を最優先（登録済みredirect_uriと確実に一致させるため）。
export function getBaseUrl(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env && env.trim()) {
    let u = env.trim().replace(/\/+$/, "");
    // https:// が付いていないと redirect_uri がカスタムスキーム扱いになり
    // LINEで「Invalid redirect custom scheme」400になるため必ず補う
    if (!/^https?:\/\//i.test(u)) u = "https://" + u.replace(/^\/+/, "");
    return u;
  }
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  return `${proto}://${host}`;
}
