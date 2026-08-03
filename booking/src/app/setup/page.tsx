"use client";

import { useState } from "react";

export default function SetupPage() {
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("tra2016");
  const [email, setEmail] = useState("abesekkotsuin.ibaraki@gmail.com");
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/setup-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, pw, email }),
      });
      const j = (await res.json()) as { ok: boolean; reason?: string; email?: string };
      if (j.ok) {
        setOk(true);
        setMsg(`完了しました！これから「${j.email}」＋設定したパスワードでログインできます。`);
      } else {
        setMsg(j.reason || "失敗しました");
      }
    } catch {
      setMsg("通信エラー");
    }
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow">
        <div className="text-center">
          <h1 className="text-lg font-bold text-slate-800">ログイン用アカウントの設定</h1>
          <p className="mt-1 text-xs text-slate-500">今のパスワードで本人確認し、新しいログイン用メール／パスワードを登録します。</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">今のパスワード（本人確認）</label>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2" required autoFocus />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">新しいログイン用メール</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2" required />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">新しいパスワード</label>
          <input type="text" value={pw} onChange={(e) => setPw(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2" required />
        </div>

        {msg && <p className={`text-sm ${ok ? "text-emerald-600" : "text-red-600"}`}>{msg}</p>}

        <button type="submit" disabled={busy}
          className="w-full rounded-lg bg-blue-600 py-2.5 font-bold text-white disabled:bg-slate-300">
          {busy ? "設定中…" : "この内容で設定する"}
        </button>
        {ok && (
          <a href="/admin/login" className="block text-center text-sm font-bold text-blue-600">→ ログイン画面へ</a>
        )}
      </form>
    </main>
  );
}
