"use client";

import { useEffect, useState } from "react";

// 予約トップ（院選択）に常設する「現在の予約状況」バナー。
// ログイン済み（line_uid Cookie もしくは LIFF idToken）なら件数と直近予約を要約表示。
// 未ログインなら /my への確認ボタンを出し、いつでも確認・変更しやすくする。

const NAVY = "#0f1f40";
const GOLD = "#c9a227";
const WD = ["日", "月", "火", "水", "木", "金", "土"];
const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || "";

type Kind = "class" | "kawanishi" | "care";

interface Item {
  id: string;
  date: string;
  start_min: number;
  staff_name: string | null;
  staff_color: string | null;
  service_name: string | null;
  clinic: string;
  kind: Kind;
}

function fmt(date: string, startMin: number) {
  const d = new Date(date + "T00:00:00");
  const hh = String(Math.floor(startMin / 60)).padStart(2, "0");
  const mm = String(startMin % 60).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）${hh}:${mm}`;
}

// 種別バッジ：体幹教室＝オレンジ / 川西整体院＝緑 / 施術＝紺
const KIND: Record<Kind, { label: string; bg: string }> = {
  class: { label: "体幹教室", bg: "#EF6C00" },
  kawanishi: { label: "川西整体院", bg: "#2e7d32" },
  care: { label: "施術", bg: NAVY },
};

export function KindBadge({ kind }: { kind: Kind }) {
  const k = KIND[kind];
  return (
    <span
      className="inline-block shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
      style={{ backgroundColor: k.bg }}
    >
      {k.label}
    </span>
  );
}

export default function MyStatusBanner() {
  const [state, setState] = useState<"loading" | "in" | "out">("loading");
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      // LINE内（LIFF）なら idToken を取得（任意）。取れなくても Cookie で続行。
      let token = "";
      if (LIFF_ID) {
        try {
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
          await w.liff!.init({ liffId: LIFF_ID });
          if (w.liff!.isLoggedIn()) token = w.liff!.getIDToken() || "";
        } catch {
          /* LIFF不可でも Cookie で続行 */
        }
      }
      const r = await fetch("/api/my/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
      }).then((r) => r.json());
      if (!alive) return;
      if (r.ok) { setItems(r.items || []); setState("in"); }
      else setState("out");
    })().catch(() => { if (alive) setState("out"); });
    return () => { alive = false; };
  }, []);

  // 読み込み中は何も出さない（トップの表示をチラつかせない）
  if (state === "loading") return null;

  // 未ログイン：確認ボタンだけ常設
  if (state === "out") {
    return (
      <a
        href="/my"
        className="mb-4 flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-bold text-slate-700 shadow-sm transition active:scale-[.99] active:bg-slate-50"
      >
        <span aria-hidden>🔎</span>
        ご予約の確認・変更・キャンセル
        <span style={{ color: GOLD }}>›</span>
      </a>
    );
  }

  // ログイン済み・予約なし：新規予約への導線が下にあるので控えめに1行
  if (items.length === 0) {
    return (
      <a
        href="/my"
        className="mb-4 block rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center text-xs font-medium text-slate-400 shadow-sm active:bg-slate-50"
      >
        現在ご予約はありません
      </a>
    );
  }

  // ログイン済み・予約あり：件数＋直近を要約
  const shown = items.slice(0, 3);
  const rest = items.length - shown.length;
  return (
    <a
      href="/my"
      className="mb-4 block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition active:scale-[.99]"
    >
      <div
        className="flex items-center justify-between px-4 py-2.5 text-white"
        style={{ background: NAVY }}
      >
        <span className="text-sm font-bold">
          現在のご予約 <span style={{ color: GOLD }}>{items.length}</span> 件
        </span>
        <span className="text-xs font-bold" style={{ color: GOLD }}>
          確認・変更 ›
        </span>
      </div>
      <div className="divide-y divide-slate-100">
        {shown.map((it) => (
          <div key={it.id} className="px-4 py-2.5">
            <div className="flex items-center gap-2">
              <KindBadge kind={it.kind} />
              <span className="text-sm font-bold text-slate-800">
                {fmt(it.date, it.start_min)}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[11px] text-slate-500">
              {it.service_name}
              {it.staff_name && <span className="text-slate-400">／{it.staff_name}</span>}
            </div>
          </div>
        ))}
      </div>
      {rest > 0 && (
        <div className="px-4 pb-2.5 text-center text-[11px] font-medium text-slate-400">
          ＋ ほか {rest}件のご予約
        </div>
      )}
    </a>
  );
}
