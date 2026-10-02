"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { api } from "@/lib/api";
import { addDays, toDateStr } from "@/lib/date";
import { findIngredient, sameIngredient } from "@/lib/ingredients";
import { SHORTCUT_NAME, parseReceipt, type ReceiptCandidate } from "@/lib/receipt";
import type { PantryItem, ShoppingItem } from "@/lib/types";

const CATEGORIES = ["野菜", "肉", "魚", "卵・乳", "豆腐・大豆", "主食", "冷凍", "その他"];

type Row = ReceiptCandidate & { on: boolean };

// レシートの文字から「家にある食材」に登録する。
// iPhone のショートカットから ?text=… 付きで開かれるか、入力欄の「テキストをスキャン」で文字を入れる。
export default function ReceiptImportPage() {
  const today = toDateStr(new Date());
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");

  const read = (t: string) => {
    const r = parseReceipt(t, today);
    setRows(r.items.map((i) => ({ ...i, on: true })));
    setUnknown(r.unknown);
    setDone(null);
  };

  useEffect(() => {
    setOrigin(window.location.origin);
    const t = new URLSearchParams(window.location.search).get("text");
    if (t) {
      setText(t);
      read(t);
      window.history.replaceState(null, "", "/pantry/import");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (i: number, v: Partial<Row>) => setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, ...v } : r)));

  const addUnknown = (label: string) => {
    const hit = findIngredient(label);
    setRows((rs) => [
      ...(rs ?? []),
      { name: label, category: hit?.category ?? "その他", quantity: null, expires_on: addDays(today, hit?.days ?? 5), on: true },
    ]);
    setUnknown((u) => u.filter((x) => x !== label));
  };

  const register = async () => {
    const chosen = (rows ?? []).filter((r) => r.on && r.name.trim());
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      await Promise.all(
        chosen.map((r) =>
          api.create<PantryItem>("pantry_items", {
            name: r.name.trim(),
            quantity: r.quantity,
            category: r.category,
            expires_on: r.expires_on,
          })
        )
      );
      // 買い物リストにあったものは「買った」として消す
      const shopping = await api.list<ShoppingItem>("shopping_items");
      const bought = shopping.filter((s) => chosen.some((r) => sameIngredient(s.name, r.name)));
      await Promise.all(bought.map((s) => api.remove("shopping_items", s.id)));
      setDone(
        `${chosen.length}件を登録しました。` + (bought.length ? `買い物リストから ${bought.map((b) => b.name).join("・")} を消しました。` : "")
      );
      setRows(null);
      setUnknown([]);
      setText("");
    } finally {
      setBusy(false);
    }
  };

  const shortcutUrl = `${origin}/pantry/import?text=`;

  return (
    <main className="pb-16">
      <PageHeader title="レシートから登録" />

      <div className="space-y-3 px-4">
        <a
          href={`shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`}
          className="block rounded-2xl bg-black py-3.5 text-center font-bold text-white"
        >
          📷 写真から読み取る（ショートカット）
        </a>

        <div>
          <p className="mb-1 text-xs font-bold text-gray-500">または、レシートの文字をここに入れる</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={"ここをタップ →「テキストをスキャン」でレシートにカメラを向けると、文字が入ります"}
            className="input text-sm"
          />
          <button
            onClick={() => read(text)}
            disabled={!text.trim()}
            className="mt-2 w-full rounded-xl bg-gray-900 py-2.5 text-sm font-bold text-white disabled:opacity-30"
          >
            読み取る
          </button>
        </div>

        {done && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{done}</p>}

        {rows && (
          <section>
            <h2 className="mb-2 mt-4 font-extrabold">見つかった食材（{rows.filter((r) => r.on).length}件）</h2>
            {rows.length === 0 && <p className="text-sm text-gray-400">食材が見つかりませんでした</p>}
            <ul className="space-y-2">
              {rows.map((r, i) => (
                <li key={i} className={`rounded-xl border p-3 ${r.on ? "border-gray-200" : "border-gray-100 opacity-40"}`}>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={r.on} onChange={(e) => update(i, { on: e.target.checked })} className="h-5 w-5" />
                    <input value={r.name} onChange={(e) => update(i, { name: e.target.value })} className="input flex-1 py-1.5 font-bold" />
                    <input
                      value={r.quantity ?? ""}
                      onChange={(e) => update(i, { quantity: e.target.value || null })}
                      placeholder="量"
                      className="input w-16 py-1.5"
                    />
                  </div>
                  <div className="mt-2 flex gap-2 pl-7">
                    <select
                      value={r.category}
                      onChange={(e) => update(i, { category: e.target.value as Row["category"] })}
                      className="input flex-1 py-1.5 text-sm"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={r.expires_on ?? ""}
                      onChange={(e) => update(i, { expires_on: e.target.value || null })}
                      className="input flex-1 py-1.5 text-sm"
                      aria-label="期限"
                    />
                  </div>
                </li>
              ))}
            </ul>

            {unknown.length > 0 && (
              <div className="mt-4">
                <p className="mb-1 text-xs font-bold text-gray-500">食材か分からなかった行（タップで追加）</p>
                <div className="flex flex-wrap gap-2">
                  {unknown.map((u) => (
                    <button key={u} onClick={() => addUnknown(u)} className="rounded-full bg-gray-100 px-3 py-1 text-xs">
                      ＋ {u}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={register}
              disabled={busy || rows.every((r) => !r.on)}
              className="mt-4 w-full rounded-2xl bg-black py-3.5 font-bold text-white disabled:opacity-30"
            >
              {rows.filter((r) => r.on).length}件を「家にある食材」に登録
            </button>
            <p className="mt-1 text-center text-[11px] text-gray-400">期限は食材ごとの目安です。パッケージの日付に直せます</p>
          </section>
        )}

        <details className="mt-6 rounded-2xl bg-gray-50 p-4 text-sm leading-relaxed">
          <summary className="font-bold">はじめての方：ショートカットの作り方（1回だけ・3分）</summary>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <li>iPhone の「ショートカット」アプリを開き、右上の「＋」</li>
            <li>
              上の名前を「<b>{SHORTCUT_NAME}</b>」にする（この名前でないとボタンから起動できません）
            </li>
            <li>「アクションを追加」で次の順に追加する
              <ol className="mt-1 list-[lower-alpha] space-y-1 pl-5">
                <li>「<b>写真を選択</b>」（その場で撮りたいときは「写真を撮る」）</li>
                <li>「<b>画像からテキストを抽出</b>」</li>
                <li>「<b>URLエンコード</b>」</li>
                <li>
                  「<b>テキスト</b>」に下のURLを貼り、最後に「変数を選択」→「URLエンコードされたテキスト」を付け足す
                  <button
                    onClick={() => navigator.clipboard?.writeText(shortcutUrl)}
                    className="mt-1 block w-full break-all rounded-lg bg-white px-3 py-2 text-left font-mono text-xs ring-1 ring-gray-200"
                  >
                    {shortcutUrl}
                    <span className="mt-1 block font-sans text-blue-600">タップでコピー</span>
                  </button>
                </li>
                <li>「<b>URLを開く</b>」</li>
              </ol>
            </li>
            <li>完了。次からは上の「📷 写真から読み取る」ボタンで起動します</li>
          </ol>
          <p className="mt-3 text-xs text-gray-500">
            読み取りは iPhone の中で行うので、通信料以外の費用はかかりません。ショートカットから開くと Safari
            で開くため、最初の1回だけ Safari でも合言葉付きのURLを開いておいてください。
          </p>
        </details>

        <Link href="/pantry" className="block py-2 text-center text-sm text-gray-500">
          ← 家にある食材へ
        </Link>
      </div>
    </main>
  );
}
