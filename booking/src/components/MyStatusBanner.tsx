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
  patient_name: string | null;
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
  const [expanded, setExpanded] = useState(false);

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

  // 読み込み中もヘッダー＋スケルトンで場所を先に確保（後から出てカードがズレるのを防ぐ）
  if (state === "loading") {
    return (
      <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 py-2.5 text-white" style={{ background: NAVY }}>
          <span className="text-sm font-bold">現在のご予約</span>
          <span className="text-xs font-bold" style={{ color: GOLD }}>確認・変更 ›</span>
        </div>
        <div className="divide-y divide-slate-100">
          {[0, 1].map((i) => (
            <div key={i} className="px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="h-4 w-14 animate-pulse rounded-md bg-slate-200" />
                <span className="h-4 w-28 animate-pulse rounded bg-slate-200" />
              </div>
              <div className="mt-1.5 h-3 w-40 animate-pulse rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    );
  }

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

  // ログイン済み・予約あり：件数＋直近を要約。
  // 2件までは全部表示。3件以上は最初の2件だけ表示し、「→」で開閉（院選択が途切れないように）。
  const many = items.length > 2;
  const visible = many && !expanded ? items.slice(0, 2) : items;
  const hidden = items.length - 2;
  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <a
        href="/my"
        className="flex items-center justify-between px-4 py-2.5 text-white transition active:opacity-90"
        style={{ background: NAVY }}
      >
        <span className="text-sm font-bold">
          現在のご予約 <span style={{ color: GOLD }}>{items.length}</span> 件
        </span>
        <span className="text-xs font-bold" style={{ color: GOLD }}>
          確認・変更 ›
        </span>
      </a>
      <div className="divide-y divide-slate-100">
        {visible.map((it) => (
          <a key={it.id} href="/my" className="block px-4 py-2.5 transition active:bg-slate-50">
            <div className="flex items-center gap-2">
              <KindBadge kind={it.kind} />
              <span className="text-sm font-bold text-slate-800">
                {fmt(it.date, it.start_min)}
              </span>
              {it.patient_name && (
                <span className="ml-auto shrink-0 text-[11px] font-bold text-slate-600">
                  {it.patient_name}様
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-slate-500">
              {it.service_name}
              {it.staff_name && <span className="text-slate-400">／{it.staff_name}</span>}
            </div>
          </a>
        ))}
      </div>
      {many && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1 border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-[12px] font-bold text-slate-500 active:bg-slate-100"
        >
          {expanded ? (
            <>閉じる <span className="text-slate-400">▲</span></>
          ) : (
            <>ほか {hidden}件を表示 <span className="text-slate-400">▶</span></>
          )}
        </button>
      )}
    </div>
  );
}
