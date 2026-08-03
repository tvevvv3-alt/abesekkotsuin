"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getSavedEmail, setSavedEmail } from "@/lib/operator";

const ENV_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "").trim();

export default function AdminLoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [savedEmail, setSaved] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSaved(getSavedEmail() || ENV_EMAIL);
  }, []);

  // 記憶しているメール（or 環境変数）があればパスワードだけ。無ければ初回のみメール入力。
  const emailToUse = savedEmail || email;
  const needEmail = !savedEmail;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emailToUse || !password) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: emailToUse,
      password,
    });
    if (error) {
      setError(needEmail ? "メールアドレスまたはパスワードが正しくありません" : "パスワードが正しくありません");
      setLoading(false);
      return;
    }
    setSavedEmail(emailToUse);
    router.replace("/admin");
    router.refresh();
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

        {needEmail && (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">メールアドレス</label>
            <input
              type="email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">パスワード</label>
          <input
            type="password"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus={!needEmail}
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

        {!needEmail && (
          <button
            type="button"
            onClick={() => { setSaved(""); setEmail(""); }}
            className="w-full text-center text-[11px] text-slate-400"
          >
            別のメールでログイン
          </button>
        )}
      </form>
    </main>
  );
}
