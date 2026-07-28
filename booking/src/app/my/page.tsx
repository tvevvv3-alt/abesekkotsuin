"use client";

import { useEffect, useState } from "react";

const NAVY = "#0f1f40";
const WD = ["日", "月", "火", "水", "木", "金", "土"];

interface Item {
  id: string;
  date: string;
  start_min: number;
  staff_id: string | null;
  service_id: string | null;
  staff_name: string | null;
  staff_color: string | null;
  service_name: string | null;
  clinic: string;
  canCancel: boolean;
  canChange: boolean;
}

function fmt(date: string, startMin: number) {
  const d = new Date(date + "T00:00:00");
  const hh = String(Math.floor(startMin / 60)).padStart(2, "0");
  const mm = String(startMin % 60).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）${hh}:${mm}`;
}

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || "";

export default function MyReservationsPage() {
  const [state, setState] = useState<"loading" | "ready" | "noliff" | "needline" | "error">("loading");
  const [idToken, setIdToken] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!LIFF_ID) { setState("noliff"); return; }
    let alive = true;
    (async () => {
      const w = window as unknown as { liff?: { init: (c: { liffId: string }) => Promise<void>; isLoggedIn: () => boolean; getIDToken: () => string | null } };
      if (!w.liff) {
        await new Promise<void>((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
          s.onload = () => res();
          s.onerror = () => rej(new Error("sdk"));
          document.head.appendChild(s);
        });
      }
      const liff = w.liff!;
      await liff.init({ liffId: LIFF_ID });
      // liff.login() は access.line.me で400になりやすいので呼ばない。
      // LINE内で開けば自動ログイン済み → idTokenが取れる。取れなければ案内。
      const token = liff.isLoggedIn() ? liff.getIDToken() : null;
      if (!token) { if (alive) setState("needline"); return; }
      const r = await fetch("/api/my/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
      }).then((r) => r.json());
      if (!alive) return;
      setIdToken(token);
      if (r.ok) { setItems(r.items); setState("ready"); } else setState("error");
    })().catch(() => { if (alive) setState("needline"); });
    return () => { alive = false; };
  }, []);

  async function cancel(item: Item) {
    if (!item.canCancel) {
      alert("キャンセル期限を過ぎています。お手数ですがお電話ください。");
      return;
    }
    if (!confirm(`${fmt(item.date, item.start_min)}\n${item.service_name || ""}\nのご予約をキャンセルしますか？`)) return;
    setBusyId(item.id);
    try {
      const r = await fetch("/api/my/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, appointmentId: item.id }),
      }).then((r) => r.json());
      if (r.ok) setItems((prev) => prev.filter((x) => x.id !== item.id));
      else if (r.reason === "deadline") alert("キャンセル期限を過ぎています。お手数ですがお電話ください。");
      else alert("キャンセルできませんでした。時間をおいて再度お試しください。");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="px-4 py-3 text-white" style={{ background: NAVY }}>
        <span className="font-bold">ご予約の確認・変更・キャンセル</span>
      </header>
      <div className="mx-auto max-w-md px-4 py-4">
        {state === "loading" && <p className="py-16 text-center text-sm text-slate-500">読み込み中…</p>}
        {state === "noliff" && <p className="py-16 text-center text-sm text-slate-500">LINEからお開きください。</p>}
        {state === "needline" && (
          <div className="rounded-xl border bg-white p-6 text-center text-sm text-slate-600">
            ご予約の確認・変更・キャンセルは<br /><b>LINEアプリ</b>からお開きください。
            {LIFF_ID && (
              <div className="mt-4">
                <a href={`https://liff.line.me/${LIFF_ID}/my`} className="inline-block rounded-lg px-5 py-2.5 text-sm font-bold text-white" style={{ background: "#06C755" }}>
                  LINEで開く
                </a>
              </div>
            )}
            <p className="mt-3 text-[11px] text-slate-400">LINEの予約確認メッセージ内のリンクからも開けます。</p>
          </div>
        )}
        {state === "error" && (
          <p className="py-16 text-center text-sm text-slate-500">
            予約情報を取得できませんでした。<br />LINEからお開きいただくか、時間をおいて再度お試しください。
          </p>
        )}
        {state === "ready" && items.length === 0 && (
          <div className="rounded-xl border bg-white p-6 text-center text-sm text-slate-500">
            今後のご予約はありません。
            <div className="mt-3">
              <a href="/" className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">＋ 新しく予約する</a>
            </div>
          </div>
        )}
        {state === "ready" && items.length > 0 && (
          <div className="space-y-3">
            {items.map((it) => (
              <div key={it.id} className="rounded-xl border bg-white p-3">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: it.staff_color || "#64748b" }} />
                  <span className="text-[11px] text-slate-400">{it.clinic}</span>
                </div>
                <div className="mt-1 text-lg font-bold text-slate-800">{fmt(it.date, it.start_min)}</div>
                <div className="text-sm text-slate-600">
                  {it.service_name}
                  {it.staff_name && <span className="text-slate-400">／{it.staff_name}</span>}
                </div>
                <div className="mt-3 flex gap-2">
                  {it.canChange && it.service_id && (
                    <a
                      href={`/?svc=${it.service_id}&stf=${it.staff_id ?? ""}&resched=${it.id}`}
                      className="flex-1 rounded-lg border border-blue-600 px-3 py-2 text-center text-sm font-bold text-blue-600 active:bg-blue-50"
                    >
                      日時を変更
                    </a>
                  )}
                  <button
                    onClick={() => cancel(it)}
                    disabled={busyId === it.id}
                    className="flex-1 rounded-lg border border-red-300 px-3 py-2 text-center text-sm font-bold text-red-500 active:bg-red-50 disabled:opacity-50"
                  >
                    {busyId === it.id ? "処理中…" : "キャンセル"}
                  </button>
                </div>
                {(!it.canCancel || !it.canChange) && (
                  <p className="mt-1.5 text-[10px] text-slate-400">
                    {!it.canCancel && "キャンセル期限を過ぎています。"}
                    {!it.canChange && "変更期限を過ぎています。"}
                    お急ぎの場合はお電話ください。
                  </p>
                )}
              </div>
            ))}
            <div className="pt-1 text-center">
              <a href="/" className="text-sm font-bold text-blue-600">＋ 新しく予約する</a>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
