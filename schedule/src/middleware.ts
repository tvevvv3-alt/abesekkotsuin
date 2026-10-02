import { NextResponse, type NextRequest } from "next/server";

// ログインの代わりに「合言葉付きURL」で家族以外の閲覧を防ぐ。
// 環境変数 FAMILY_KEY を設定すると、最初に https://…/?key=合言葉 を一度開くだけで
// その端末に1年間 Cookie が残り、以後は普通のURLで使える。未設定なら制限なし。
const COOKIE = "family_key";

export function middleware(req: NextRequest) {
  const key = process.env.FAMILY_KEY;
  if (!key) return NextResponse.next();

  const fromQuery = req.nextUrl.searchParams.get("key");
  if (fromQuery === key) {
    const url = req.nextUrl.clone();
    url.searchParams.delete("key");
    const res = NextResponse.redirect(url);
    res.cookies.set(COOKIE, key, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
    return res;
  }
  if (req.cookies.get(COOKIE)?.value === key) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return new NextResponse("このページを見るには、合言葉付きのURLを開いてください。", {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
