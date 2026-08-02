"use client";

import { useEffect, useState } from "react";

// 公開鍵（VAPID public key）は秘密ではないので既定値を同梱。
// 環境変数が正しく設定されていればそちらを優先、無効なら既定値にフォールバック。
const FALLBACK_VAPID_PUBLIC =
  "BIgxLWtKe8jmM4ChMdSylMqzdDA0xqjoUbWo24lHi7fq-ggAJY-DtrunjTsIgaW43t3GroBtu5MQWOJiNDuYQzc";
const ENV_VAPID = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").replace(/[^A-Za-z0-9\-_]/g, "");
const VAPID_PUBLIC = ENV_VAPID.length >= 80 ? ENV_VAPID : FALLBACK_VAPID_PUBLIC;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  // 環境変数に混入しがちな空白・改行や base64url 以外の文字を除去
  const clean = base64.trim().replace(/[^A-Za-z0-9\-_]/g, "");
  const padding = "=".repeat((4 - (clean.length % 4)) % 4);
  const b64 = (clean + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type State = "loading" | "unsupported" | "off" | "on" | "denied" | "busy";

// 運営端末をプッシュ通知に登録するボタン（iPhoneはホーム画面に追加後に有効）
export default function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<string | null>(null);

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  useEffect(() => {
    if (!supported || !VAPID_PUBLIC) {
      setState("unsupported");
      return;
    }
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        if (Notification.permission === "denied") setState("denied");
        else setState(sub ? "on" : "off");
      } catch {
        setState("unsupported");
      }
    })();
  }, [supported]);

  // アプリを開いている間はアイコンのバッジ（未読数）を消す
  useEffect(() => {
    const clear = () => {
      try {
        (navigator as Navigator & { clearAppBadge?: () => Promise<void> }).clearAppBadge?.();
      } catch {}
      navigator.serviceWorker?.ready
        .then((r) => r.active?.postMessage("clear-badge"))
        .catch(() => {});
    };
    clear();
    const onVis = () => {
      if (document.visibilityState === "visible") clear();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  async function enable() {
    setState("busy");
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as unknown as BufferSource,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), label: navigator.userAgent.slice(0, 60) }),
      });
      const j = (await res.json()) as { ok: boolean; reason?: string };
      if (!j.ok) {
        setMsg("登録に失敗しました：" + (j.reason ?? "?"));
        setState("off");
        return;
      }
      setState("on");
      setMsg("この端末に通知が届くようになりました。");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "登録エラー");
      setState("off");
    }
  }

  async function disable() {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
      setMsg(null);
    } catch {
      setState("on");
    }
  }

  async function test() {
    setMsg(null);
    await fetch("/api/push/test", { method: "POST" });
    setMsg("テスト通知を送信しました。数秒お待ちください。");
  }

  if (state === "loading") return null;

  if (state === "unsupported")
    return (
      <div className="px-4 py-2 text-[11px] text-slate-400">
        通知はこの端末では利用できません（iPhoneはSafariで開き「ホーム画面に追加」後に再度お試しください）。
      </div>
    );

  return (
    <div className="border-t px-4 py-3">
      {state === "on" ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-sm font-bold text-emerald-600">🔔 通知オン</span>
          <button onClick={test} className="ml-auto rounded-md border px-2 py-1 text-[11px] text-slate-500 active:bg-slate-100">テスト</button>
          <button onClick={disable} className="rounded-md border px-2 py-1 text-[11px] text-slate-500 active:bg-slate-100">オフ</button>
        </div>
      ) : state === "denied" ? (
        <div className="text-[11px] text-amber-600">
          通知がブロックされています。iPhoneの「設定 › 通知 › 阿部接骨院」または Safari の許可設定をオンにしてください。
        </div>
      ) : (
        <button
          onClick={enable}
          disabled={state === "busy"}
          className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white active:bg-blue-700 disabled:bg-slate-300"
        >
          🔔 {state === "busy" ? "設定中…" : "予約通知をオンにする"}
        </button>
      )}
      {msg && <p className="mt-1.5 text-[11px] text-slate-500">{msg}</p>}
      <p className="mt-1 text-[9px] text-slate-300">通知v5 / 鍵長 {VAPID_PUBLIC.length}</p>
    </div>
  );
}
