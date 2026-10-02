"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { api } from "@/lib/api";
import { toRecipe } from "@/lib/customRecipes";
import { normalizeText } from "@/lib/ingredients";
import { MEAL_SLOT_LABEL } from "@/lib/labels";
import { RECIPES } from "@/lib/recipes";
import type { CustomRecipe, MealSlot } from "@/lib/types";

const SLOTS: MealSlot[] = ["dinner", "breakfast", "bento"];

// レシピ集。献立の提案はここから選ばれる。家族の定番を追加できる
export default function RecipesPage() {
  const [custom, setCustom] = useState<CustomRecipe[]>([]);
  const [slot, setSlot] = useState<MealSlot>("dinner");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", ingredients: "", rice: true, minutes: 20, toddler_note: "" });
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .list<CustomRecipe>("custom_recipes")
      .then(setCustom)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const list = useMemo(() => {
    const key = normalizeText(q.trim());
    return [...custom.map(toRecipe), ...RECIPES]
      .filter((r) => r.slot === slot)
      .filter((r) => !key || normalizeText(r.name).includes(key) || r.ing.some((i) => normalizeText(i).includes(key)));
  }, [custom, q, slot]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await api.create<CustomRecipe>("custom_recipes", {
      slot: slot as CustomRecipe["slot"],
      name: form.name.trim(),
      ingredients: form.ingredients.split(/[,、\s]+/).map((x) => x.trim()).filter(Boolean),
      rice: form.rice,
      minutes: Number(form.minutes) || 20,
      toddler_note: form.toddler_note.trim() || null,
    });
    setForm({ name: "", ingredients: "", rice: true, minutes: 20, toddler_note: "" });
    setAdding(false);
    load();
  };

  return (
    <main className="pb-16">
      <PageHeader title="レシピ集" />
      {error && <p className="mx-5 mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="mx-4 mb-3 flex rounded-xl bg-gray-100 p-1">
        {SLOTS.map((s) => (
          <button
            key={s}
            onClick={() => setSlot(s)}
            className={`flex-1 rounded-lg py-1.5 text-sm font-bold ${slot === s ? "bg-white shadow" : "text-gray-500"}`}
          >
            {MEAL_SLOT_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="mx-4 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="料理名・食材で探す" className="input flex-1" />
        <button onClick={() => setAdding((v) => !v)} className="shrink-0 rounded-xl bg-black px-4 text-sm font-bold text-white">
          ＋ 追加
        </button>
      </div>

      {adding && (
        <form onSubmit={add} className="mx-4 mt-3 space-y-2 rounded-2xl bg-gray-50 p-4">
          <p className="text-xs font-bold text-gray-500">{MEAL_SLOT_LABEL[slot]}に家族の定番を追加</p>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="料理名" className="input" />
          <input
            value={form.ingredients}
            onChange={(e) => setForm({ ...form, ingredients: e.target.value })}
            placeholder="主な食材（例：豚こま肉、キャベツ、もやし）"
            className="input"
          />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={form.rice} onChange={(e) => setForm({ ...form, rice: e.target.checked })} />
              お米を食べる
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="number"
                value={form.minutes}
                onChange={(e) => setForm({ ...form, minutes: Number(e.target.value) })}
                className="input w-20 py-1"
              />
              分
            </label>
          </div>
          <textarea
            value={form.toddler_note}
            onChange={(e) => setForm({ ...form, toddler_note: e.target.value })}
            placeholder="三男向けの取り分け方（なくてもOK）"
            rows={2}
            className="input text-sm"
          />
          <button className="w-full rounded-xl bg-black py-2.5 text-sm font-bold text-white">保存</button>
        </form>
      )}

      <p className="mx-4 mt-3 text-xs text-gray-400">{list.length}品</p>
      <ul className="divide-y divide-gray-100 px-4">
        {list.map((r) => (
          <li key={r.id} className="py-3">
            <div className="flex items-start gap-2">
              <p className="flex-1 font-bold">
                {r.name}
                {r.custom && <span className="ml-1 text-xs font-normal text-blue-600">追加した料理</span>}
              </p>
              <span className="shrink-0 text-xs text-gray-500">
                {r.rice && "🍚 "}
                {r.min}分
              </span>
            </div>
            <p className="text-xs text-gray-400">{r.ing.join("・")}</p>
            {r.sides.length > 0 && <p className="text-xs text-gray-500">＋ {r.sides.join("・")}</p>}
            {r.toddler && <p className="mt-1 text-xs text-purple-700">三男：{r.toddler}</p>}
            {r.custom && (
              <button
                onClick={async () => {
                  if (!confirm(`${r.name} を削除しますか？`)) return;
                  await api.remove("custom_recipes", r.id.replace(/^c-/, ""));
                  load();
                }}
                className="mt-1 text-xs text-red-500"
              >
                削除
              </button>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
