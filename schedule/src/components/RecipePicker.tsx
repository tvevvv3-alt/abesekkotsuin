"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toRecipe } from "@/lib/customRecipes";
import { normalizeText } from "@/lib/ingredients";
import { RECIPES, type Recipe } from "@/lib/recipes";
import type { CustomRecipe, MealSlot } from "@/lib/types";
import Sheet from "./Sheet";

// レシピ集から料理を選ぶ（献立と違うものを作った日の記録にも使う）
export default function RecipePicker({
  slot,
  onPick,
  onClose,
}: {
  slot: MealSlot;
  onPick: (r: Recipe) => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState<Recipe[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    api
      .list<CustomRecipe>("custom_recipes")
      .then((rows) => setCustom(rows.map(toRecipe)))
      .catch(() => setCustom([]));
  }, []);

  const list = useMemo(() => {
    const key = normalizeText(q.trim());
    return [...custom, ...RECIPES]
      .filter((r) => r.slot === slot)
      .filter((r) => !key || normalizeText(r.name).includes(key) || r.ing.some((i) => normalizeText(i).includes(key)));
  }, [custom, q, slot]);

  return (
    <Sheet title="レシピから選ぶ" onClose={onClose} z="z-[60]">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="料理名・食材で探す（例：鮭、うどん）"
        className="input mb-3"
      />
      <ul className="divide-y divide-gray-100">
        {list.map((r) => (
          <li key={r.id}>
            <button onClick={() => onPick(r)} className="flex w-full items-center gap-2 py-3 text-left">
              <span className="flex-1">
                <span className="font-bold">{r.name}</span>
                {r.custom && <span className="ml-1 text-xs text-blue-600">追加した料理</span>}
                <span className="block text-xs text-gray-400">{r.ing.join("・")}</span>
              </span>
              <span className="shrink-0 text-xs text-gray-500">
                {r.rice && "🍚 "}
                {r.min}分
              </span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="py-6 text-center text-sm text-gray-400">見つかりません</li>}
      </ul>
    </Sheet>
  );
}
