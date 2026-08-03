import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ログイン用アカウント（メール）を作成／パスワード更新する一度きりの設定用。
// 現在ログイン中の管理者だけが実行できる。パスワードは ?pw= で渡す（コードに残さない）。
// 例: /api/admin/setup-login?email=abesekkotsuin.ibaraki@gmail.com&pw=xxxxxx
export async function GET(req: NextRequest) {
  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "ログインしてから開いてください" }, { status: 401 });

  const url = new URL(req.url);
  const email = (url.searchParams.get("email") || "abesekkotsuin.ibaraki@gmail.com").trim();
  const pw = url.searchParams.get("pw") || "";
  if (pw.length < 6) return NextResponse.json({ ok: false, reason: "?pw= に6文字以上のパスワードを指定してください" }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, reason: "server" }, { status: 500 });

  const { error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) {
    // 既に存在する場合はパスワードを更新
    const { data: list } = await admin.auth.admin.listUsers();
    const found = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) {
      const { error: upErr } = await admin.auth.admin.updateUserById(found.id, { password: pw, email_confirm: true });
      if (upErr) return NextResponse.json({ ok: false, reason: upErr.message }, { status: 500 });
      return NextResponse.json({ ok: true, updated: true, email });
    }
    return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, created: true, email });
}
