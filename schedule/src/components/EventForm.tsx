"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { AWAY_MEAL_LABEL } from "@/lib/labels";
import type { AwayMeal, FamilyEvent, Member } from "@/lib/types";
import Sheet from "./Sheet";

type Props = {
  date: string;
  event?: FamilyEvent;
  members: Member[];
  onClose: () => void;
  onSaved: (date: string) => void; // 予定が変わった日（日付変更時は早いほう）
};

// 予定の追加・編集。外出/帰宅時刻と「家で食べない食事」もここで登録する。
export default function EventForm({ date, event, members, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    date: event?.date ?? date,
    title: event?.title ?? "",
    member_ids: event?.member_ids ?? [],
    start_time: event?.start_time ?? "",
    end_time: event?.end_time ?? "",
    tentative: event?.tentative ?? false,
    away_meals: event?.away_meals ?? ([] as AwayMeal[]),
    memo: event?.memo ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const allSelected = members.length > 0 && form.member_ids.length === members.length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return setError("予定の名前を入れてください");
    setBusy(true);
    const values = {
      ...form,
      title: form.title.trim(),
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      memo: form.memo.trim() || null,
    };
    try {
      if (event) await api.update<FamilyEvent>("events", event.id, values);
      else await api.create<FamilyEvent>("events", values);
      onSaved(event && event.date < values.date ? event.date : values.date);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!event || !confirm("この予定を削除しますか？")) return;
    setBusy(true);
    await api.remove("events", event.id);
    onSaved(event.date);
  };

  return (
    <Sheet title={event ? "予定を編集" : "予定を追加"} onClose={onClose} z="z-[60]">
      <form onSubmit={submit} className="space-y-5">
        <input
          autoFocus={!event}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="予定（例：歯医者、運動会）"
          className="input text-lg font-bold"
        />

        <Field label="日付">
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="input"
          />
        </Field>

        <Field label="だれの予定">
          <div className="flex flex-wrap gap-2">
            <Pill
              active={allSelected}
              color="#64748b"
              onClick={() => setForm({ ...form, member_ids: allSelected ? [] : members.map((m) => m.id) })}
            >
              家族みんな
            </Pill>
            {members.map((m) => (
              <Pill
                key={m.id}
                active={form.member_ids.includes(m.id)}
                color={m.color}
                onClick={() => setForm({ ...form, member_ids: toggle(form.member_ids, m.id) })}
              >
                {m.name}
              </Pill>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="外出">
            <input
              type="time"
              value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="帰宅">
            <input
              type="time"
              value={form.end_time}
              onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              className="input"
            />
          </Field>
        </div>

        <Field label="家で食べない食事">
          <div className="flex gap-2">
            {(Object.keys(AWAY_MEAL_LABEL) as AwayMeal[]).map((m) => (
              <Pill
                key={m}
                active={form.away_meals.includes(m)}
                color="#111827"
                onClick={() => setForm({ ...form, away_meals: toggle(form.away_meals, m) })}
              >
                {AWAY_MEAL_LABEL[m]}ごはん
              </Pill>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-400">選んだ人は、その食事を献立の人数から外します</p>
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.tentative}
            onChange={(e) => setForm({ ...form, tentative: e.target.checked })}
          />
          まだ仮の予定（カレンダーで薄く表示）
        </label>

        <Field label="メモ">
          <textarea
            value={form.memo}
            onChange={(e) => setForm({ ...form, memo: e.target.value })}
            rows={2}
            className="input"
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button disabled={busy} className="w-full rounded-2xl bg-black py-3.5 font-bold text-white disabled:opacity-50">
          保存
        </button>
        {event && (
          <button type="button" onClick={remove} disabled={busy} className="w-full py-2 text-sm text-red-600">
            この予定を削除
          </button>
        )}
      </form>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-bold text-gray-500">{label}</p>
      {children}
    </div>
  );
}

function Pill({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border-2 px-3 py-1.5 text-sm font-bold"
      style={active ? { background: color, borderColor: color, color: "#fff" } : { borderColor: color, color }}
    >
      {children}
    </button>
  );
}
