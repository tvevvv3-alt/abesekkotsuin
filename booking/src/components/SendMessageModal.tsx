"use client";

import { useEffect, useRef, useState } from "react";

// LINE通知（体幹終了・パーソナル終了・問診票・申込書など）を送る前に、
// 実際に送られる本文をポップアップで表示し、その場で編集してから送信できる共通モーダル。
//  1) 開くと endpoint に { ...payload, preview:true } をPOST → 本文プレビューを取得
//  2) テキストエリアで編集
//  3) 「送信」で endpoint に { ...payload, text } をPOST → 編集後の本文を送信
function reasonLabel(reason?: string): string {
  switch (reason) {
    case "auth": return "管理者ログインが必要です。";
    case "noline": return "この方はLINE未連携のため送信できません。";
    case "notconfigured": return "LINEメッセージ送信の設定が未完了です。";
    case "nourl": return "URLが設定されていません（設定画面で登録してください）。";
    case "notfound":
    case "noappt": return "対象の予約が見つかりません。";
    case "nourltext":
    case "bad": return "送信内容を用意できませんでした。";
    case "send":
    case "line": return "送信に失敗しました。時間をおいて再度お試しください。";
    default: return reason ? `エラー：${reason}` : "処理できませんでした。";
  }
}

export default function SendMessageModal({
  title,
  endpoint,
  payload,
  note,
  sendLabel = "送信",
  onClose,
  onSent,
}: {
  title: string;
  endpoint: string;
  payload: Record<string, unknown>;
  note?: string;
  sendLabel?: string;
  onClose: () => void;
  onSent?: (result: { ok: boolean } & Record<string, unknown>) => void;
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // payload はマウント時点の内容で固定（再取得ループ防止）
  const payloadRef = useRef(payload);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payloadRef.current, preview: true }),
        });
        const j = (await res.json()) as { ok: boolean; preview?: string; reason?: string };
        if (!alive) return;
        if (j.ok && typeof j.preview === "string") setText(j.preview);
        else setErr(reasonLabel(j.reason));
      } catch {
        if (alive) setErr("通信エラーが発生しました。");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [endpoint]);

  async function send() {
    if (!text.trim()) {
      setErr("本文が空です。");
      return;
    }
    setSending(true);
    setErr(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payloadRef.current, text }),
      });
      const j = (await res.json()) as { ok: boolean; reason?: string } & Record<string, unknown>;
      if (j.ok) {
        onSent?.(j);
        onClose();
      } else {
        setErr(reasonLabel(j.reason));
      }
    } catch {
      setErr("通信エラーが発生しました。");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400">✕</button>
        </div>
        <p className="mb-2 text-[11px] text-slate-500">
          下の内容がLINEで送られます。<b>その場で編集</b>してから送信できます。
          {note ? <span className="block text-slate-400">{note}</span> : null}
        </p>

        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">本文を読み込み中…</div>
        ) : (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed text-slate-800 focus:border-blue-400 focus:outline-none"
            placeholder="送信する本文"
          />
        )}

        {err && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] font-bold text-red-600">{err}</p>}

        <div className="mt-3 flex items-center gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-600 active:bg-slate-100">
            閉じる
          </button>
          <button
            onClick={send}
            disabled={sending || loading || !text.trim()}
            className="ml-auto rounded-lg bg-green-600 px-5 py-2 text-sm font-bold text-white active:bg-green-700 disabled:bg-slate-300"
          >
            {sending ? "送信中…" : `${sendLabel}`}
          </button>
        </div>
      </div>
    </div>
  );
}
