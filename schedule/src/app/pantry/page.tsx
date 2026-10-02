"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { api } from "@/lib/api";
import { parseDateStr, toDateStr } from "@/lib/date";
import type { PantryItem } from "@/lib/types";

const CATEGORIES = ["野菜", "肉", "魚", "卵・乳", "豆腐・大豆", "主食", "調味料", "冷凍", "その他"];

// 家にある食材。期限が近い順に並べ、献立の提案で先に使う。
export default function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [form, setForm] = useState({ name: "", quantity: "", category: "野菜", expires_on: "" });
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .list<PantryItem>("pantry_items")
      .then(setItems)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await api.create<PantryItem>("pantry_items", {
      name: form.name.trim(),
      quantity: form.quantity.trim() || null,
      category: form.category,
      expires_on: form.expires_on || null,
    });
    setForm({ ...form, name: "", quantity: "", expires_on: "" });
    load();
  };

  const today = toDateStr(new Date());
  const daysLeft = (d: string | null) =>
    d == null ? null : Math.round((parseDateStr(d).getTime() - parseDateStr(today).getTime()) / 86400000);

  return (
    <main className="pb-16">
      <PageHeader title="家にある食材" />
      {error && <p className="mx-5 mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <form onSubmit={add} className="mx-4 space-y-2 rounded-2xl bg-gray-50 p-4">
        <div className="flex gap-2">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="食材（例：にんじん）"
            className="input flex-[2]"
          />
          <input
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            placeholder="量"
            className="input flex-1"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="input flex-1"
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input
            type="date"
            value={form.expires_on}
            onChange={(e) => setForm({ ...form, expires_on: e.target.value })}
            className="input flex-1"
            aria-label="期限"
          />
        </div>
        <button className="w-full rounded-xl bg-black py-2.5 text-sm font-bold text-white">追加</button>
      </form>

      <ul className="mt-4 divide-y divide-gray-100 px-4">
        {items.length === 0 && <li className="py-6 text-center text-sm text-gray-400">食材はまだありません</li>}
        {items.map((it) => {
          const left = daysLeft(it.expires_on);
          const tone =
            left == null ? "text-gray-400" : left <= 1 ? "text-red-600 font-bold" : left <= 3 ? "text-amber-600 font-bold" : "text-gray-500";
          return (
            <li key={it.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {it.name}
                  {it.quantity && <span className="ml-2 text-sm font-normal text-gray-500">{it.quantity}</span>}
                </p>
                <p className="text-xs">
                  <span className="text-gray-400">{it.category}</span>
                  {it.expires_on && (
                    <span className={`ml-2 ${tone}`}>
                      {left! < 0 ? `期限切れ（${-left!}日前）` : left === 0 ? "今日まで" : `あと${left}日`}
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={async () => {
                  await api.remove("pantry_items", it.id);
                  load();
                }}
                className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600"
              >
                使い切った
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
