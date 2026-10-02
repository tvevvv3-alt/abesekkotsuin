"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { api } from "@/lib/api";
import type { PantryItem, ShoppingItem } from "@/lib/types";

export default function ShoppingPage() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .list<ShoppingItem>("shopping_items")
      .then(setItems)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await api.create<ShoppingItem>("shopping_items", { name: name.trim(), quantity: quantity.trim() || null, checked: false });
    setName("");
    setQuantity("");
    load();
  };

  const toggle = async (it: ShoppingItem) => {
    setItems((l) => l.map((x) => (x.id === it.id ? { ...x, checked: !x.checked } : x)));
    await api.update<ShoppingItem>("shopping_items", it.id, { checked: !it.checked });
  };

  // 買い終わったものを「家にある食材」に移す
  const moveToPantry = async () => {
    const done = items.filter((i) => i.checked);
    await Promise.all(
      done.map(async (i) => {
        await api.create<PantryItem>("pantry_items", { name: i.name, quantity: i.quantity, category: "その他", expires_on: null });
        await api.remove("shopping_items", i.id);
      })
    );
    load();
  };

  const checkedCount = items.filter((i) => i.checked).length;

  return (
    <main className="pb-16">
      <PageHeader title="買い物リスト" />
      {error && <p className="mx-5 mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <form onSubmit={add} className="mx-4 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="買うもの" className="input flex-[2]" />
        <input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="量" className="input flex-1" />
        <button className="rounded-xl bg-black px-4 text-sm font-bold text-white">追加</button>
      </form>

      <ul className="mt-4 divide-y divide-gray-100 px-4">
        {items.length === 0 && <li className="py-6 text-center text-sm text-gray-400">買うものはありません</li>}
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-3 py-3">
            <button
              onClick={() => toggle(it)}
              aria-label="チェック"
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
                it.checked ? "border-black bg-black text-white" : "border-gray-300"
              }`}
            >
              {it.checked && "✓"}
            </button>
            <p className={`flex-1 ${it.checked ? "text-gray-400 line-through" : "font-bold"}`}>
              {it.name}
              {it.quantity && <span className="ml-2 text-sm font-normal text-gray-500">{it.quantity}</span>}
            </p>
            <button
              onClick={async () => {
                await api.remove("shopping_items", it.id);
                load();
              }}
              className="text-xs text-gray-400"
            >
              削除
            </button>
          </li>
        ))}
      </ul>

      {checkedCount > 0 && (
        <div className="px-4 pt-4">
          <button onClick={moveToPantry} className="w-full rounded-2xl bg-black py-3 font-bold text-white">
            買ったもの {checkedCount} 件を「家にある食材」へ
          </button>
        </div>
      )}
    </main>
  );
}
