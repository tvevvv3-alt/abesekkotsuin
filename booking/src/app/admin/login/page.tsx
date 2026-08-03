"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ログイン用の固定アカウント（メールは秘密ではないので固定。環境変数で上書き可）。
// パスワードはコードに持たず、Supabase 認証で照合する。
const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "abesekkotsuin.ibaraki@gmail.com").trim();
const PW_KEY = "abe_admin_pw"; // この端末を記憶して次回から省略（共有端末向け）

export default function AdminLoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoTrying, setAutoTrying] = useState(true);

  // 端末を記憶していれば自動ログイン（＝2回目以降はパスワード入力をスキップ）
  useEffect(() => {
    let done = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) { router.replace("/admin"); return; }
      let saved = "";
      try { saved = localStorage.getItem(PW_KEY) || ""; } catch { /* noop */ }
      if (saved) {
        const { error } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: atob(saved) });
        if (!error) { done = true; router.replace("/admin"); router.refresh(); return; }
        try { localStorage.removeItem(PW_KEY); } catch { /* noop */ }
      }
      if (!done) setAutoTrying(false);
    })();
  }, [router, supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password,
    });
    if (error) {
      setError("パスワードが正しくありません");
      setLoading(false);
      return;
    }
    try { localStorage.setItem(PW_KEY, btoa(password)); } catch { /* noop */ }
    router.replace("/admin");
    router.refresh();
  }

  if (autoTrying) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-400">読み込み中…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-2xl bg-white p-6 shadow"
      >
        <div className="text-center">
          <h1 className="text-xl font-bold text-slate-800">阿部接骨院</h1>
          <p className="mt-1 text-sm text-slate-500">予約管理 ログイン</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">パスワード</label>
          <input
            type="password"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          className="w-full rounded-lg bg-blue-600 py-2.5 font-bold text-white disabled:bg-slate-300"
          disabled={loading}
        >
          {loading ? "ログイン中…" : "ログイン"}
        </button>
        <p className="text-center text-[11px] text-slate-400">
          この端末を記憶し、次回からは自動でログインします。
        </p>
      </form>
    </main>
  );
}
