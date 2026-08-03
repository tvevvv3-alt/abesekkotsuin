"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const DEFAULT_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "t.ve.vvv3@gmail.com").trim();

export default function AdminLoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState(DEFAULT_EMAIL);
  const [showEmail, setShowEmail] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
    });
    if (error) {
      setError("パスワードが正しくありません");
      setShowEmail(true); // 念のため：失敗時はメールも直せるように表示
      setLoading(false);
      return;
    }
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

        {showEmail && (
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

        {!showEmail && (
          <button
            type="button"
            onClick={() => setShowEmail(true)}
            className="w-full text-center text-[11px] text-slate-400"
          >
            メールアドレスを変更
          </button>
        )}
      </form>
    </main>
  );
}
