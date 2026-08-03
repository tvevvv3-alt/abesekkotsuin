import { NextRequest, NextResponse } from "next/server";
import { createClient as createRaw } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 現在のログイン用アカウント（本人確認に使う）
const OWNER_EMAIL = "t.ve.vvv3@gmail.com";

// ログイン用アカウント（メール）を作成／パスワード更新する一度きりの設定用。
// 本人確認：現在のパスワードを ?current= で渡す（=今ログインできるパスワード）。
// 新アカウント：?email=（既定 abesekkotsuin.ibaraki@gmail.com）&pw=（新パスワード）
// 例: /api/admin/setup-login?current=いまのパス&pw=tra2016
export async function POST(req: NextRequest) {
  let b: { current?: string; email?: string; pw?: string } = {};
  try { b = await req.json(); } catch { /* noop */ }
  return handle(b.current || "", (b.email || "abesekkotsuin.ibaraki@gmail.com").trim(), b.pw || "");
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  return handle(
    url.searchParams.get("current") || "",
    (url.searchParams.get("email") || "abesekkotsuin.ibaraki@gmail.com").trim(),
    url.searchParams.get("pw") || ""
  );
}

async function handle(current: string, email: string, pw: string) {
  if (!current) return NextResponse.json({ ok: false, reason: "今のパスワードを入力してください" }, { status: 400 });
  if (pw.length < 6) return NextResponse.json({ ok: false, reason: "新しいパスワードは6文字以上にしてください" }, { status: 400 });

  // 本人確認：今のパスワードでログインできるか確認
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!supaUrl || !anon) return NextResponse.json({ ok: false, reason: "server config" }, { status: 500 });
  const raw = createRaw(supaUrl, anon, { auth: { persistSession: false } });
  const { error: authErr } = await raw.auth.signInWithPassword({ email: OWNER_EMAIL, password: current });
  if (authErr) return NextResponse.json({ ok: false, reason: "今のパスワードが違います（本人確認に失敗）" }, { status: 401 });

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
