"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { RATING_LABEL } from "@/lib/labels";
import type { MealOption, MealPlan, MealSlot, Member, Rating } from "@/lib/types";

type Props = {
  date: string;
  slot: MealSlot;
  label: string;
  subtitle: string;
  plan: MealPlan | null;
  members: Member[];
  onChanged: () => void;
};

// 1食分の献立カード。A/B を見比べて、その日の気分で選べる。
export default function MealCard({ date, slot, label, subtitle, plan, members, onChanged }: Props) {
  const [view, setView] = useState(plan?.chosen ?? plan?.options[0]?.label ?? "A");
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);

  const children = members.filter((m) => m.role === "child");
  const youngest = [...children].sort((a, b) => (b.birth_date ?? "").localeCompare(a.birth_date ?? ""))[0];
  const option = plan?.options.find((o) => o.label === view) ?? plan?.options[0];

  const save = async (values: Partial<MealPlan>) => {
    if (!plan) return;
    setBusy(true);
    try {
      await api.update<MealPlan>("meal_plans", plan.id, values);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const rate = (memberId: string, r: Rating) => {
    if (!plan) return;
    const ratings = { ...plan.ratings };
    if (ratings[memberId] === r) delete ratings[memberId];
    else ratings[memberId] = r;
    save({ ratings });
  };

  return (
    <div className="rounded-2xl border border-gray-200">
      <div className="flex items-baseline justify-between px-4 pt-3">
        <h3 className="text-base font-extrabold">{label}</h3>
        <span className="text-xs text-gray-500">{subtitle}</span>
      </div>

      {!plan && !manual && (
        <div className="px-4 pb-4 pt-2">
          <p className="text-sm text-gray-400">まだ献立がありません</p>
          <button onClick={() => setManual(true)} className="mt-2 text-sm font-bold text-blue-600">
            ＋ 自分で入力する
          </button>
        </div>
      )}

      {!plan && manual && (
        <ManualForm
          onCancel={() => setManual(false)}
          onSave={async (options) => {
            await api.create<MealPlan>("meal_plans", { date, slot, options, chosen: null, ratings: {} });
            setManual(false);
            onChanged();
          }}
        />
      )}

      {plan && option && (
        <div className="px-4 pb-4 pt-2">
          {plan.options.length > 1 && (
            <div className="mb-3 flex rounded-xl bg-gray-100 p-1">
              {plan.options.map((o) => (
                <button
                  key={o.label}
                  onClick={() => setView(o.label)}
                  className={`flex-1 rounded-lg py-1.5 text-sm font-bold ${
                    view === o.label ? "bg-white shadow" : "text-gray-500"
                  }`}
                >
                  {o.label}
                  {plan.chosen === o.label && " ✓"}
                </button>
              ))}
            </div>
          )}

          <p className="text-lg font-bold">
            {option.title}
            {option.rice && <span className="ml-2 rounded bg-amber-50 px-1.5 text-xs text-amber-700">🍚 お米</span>}
          </p>
          {option.dishes.length > 0 && <p className="mt-1 text-sm text-gray-600">{option.dishes.join(" ／ ")}</p>}

          {option.toddler_note && (
            <div className="mt-3 rounded-xl bg-purple-50 p-3 text-sm leading-relaxed text-purple-900">
              <span className="font-bold">{youngest?.name ?? "末っ子"}向け：</span>
              {option.toddler_note}
            </div>
          )}

          {plan.chosen !== option.label ? (
            <button
              disabled={busy}
              onClick={() => save({ chosen: option.label })}
              className="mt-3 w-full rounded-xl bg-black py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {plan.options.length > 1 ? `${option.label}にする` : "これにする"}
            </button>
          ) : (
            <div className="mt-4">
              <p className="mb-2 text-xs font-bold text-gray-500">食べた？</p>
              <ul className="space-y-2">
                {children.map((m) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-sm font-bold" style={{ color: m.color }}>
                      {m.name}
                    </span>
                    {(Object.keys(RATING_LABEL) as Rating[]).map((r) => (
                      <button
                        key={r}
                        disabled={busy}
                        onClick={() => rate(m.id, r)}
                        className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${
                          plan.ratings[m.id] === r ? "bg-black text-white" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {RATING_LABEL[r]}
                      </button>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={async () => {
              if (!confirm("この献立を削除しますか？")) return;
              await api.remove("meal_plans", plan.id);
              onChanged();
            }}
            className="mt-3 text-xs text-gray-400"
          >
            献立を削除
          </button>
        </div>
      )}
    </div>
  );
}

function ManualForm({ onSave, onCancel }: { onSave: (o: MealOption[]) => Promise<void>; onCancel: () => void }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [rice, setRice] = useState(true);
  const opt = (label: string, title: string): MealOption => ({
    label,
    title: title.trim(),
    dishes: [],
    rice,
    toddler_note: null,
  });
  return (
    <form
      className="space-y-2 px-4 pb-4 pt-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!a.trim()) return;
        await onSave(b.trim() ? [opt("A", a), opt("B", b)] : [opt("A", a)]);
      }}
    >
      <input value={a} onChange={(e) => setA(e.target.value)} placeholder="A：料理名（例：肉じゃが）" className="input" />
      <input value={b} onChange={(e) => setB(e.target.value)} placeholder="B：料理名（なくてもOK）" className="input" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={rice} onChange={(e) => setRice(e.target.checked)} />
        お米を食べる献立
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl bg-gray-100 py-2 text-sm font-bold">
          やめる
        </button>
        <button className="flex-1 rounded-xl bg-black py-2 text-sm font-bold text-white">保存</button>
      </div>
    </form>
  );
}
