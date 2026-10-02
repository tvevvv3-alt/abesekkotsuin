"use client";

import { WEEKDAYS, isBentoDay, parseDateStr, weekday } from "@/lib/date";
import { holidayName } from "@/lib/holidays";
import { AWAY_MEAL_LABEL, MEAL_SLOT_LABEL, eventBackground } from "@/lib/labels";
import type { FamilyEvent, MealPlan, MealSlot, Member } from "@/lib/types";
import MealCard from "./MealCard";
import Sheet from "./Sheet";

type Props = {
  date: string;
  members: Member[];
  events: FamilyEvent[];
  plans: MealPlan[];
  onClose: () => void;
  onAddEvent: () => void;
  onEditEvent: (e: FamilyEvent) => void;
  onChanged: () => void;
};

// カレンダーの日付をタップしたときのポップアップ：その日の予定と献立
export default function DaySheet({ date, members, events, plans, onClose, onAddEvent, onEditEvent, onChanged }: Props) {
  const d = parseDateStr(date);
  const holiday = holidayName(date);
  const slots: MealSlot[] = isBentoDay(date) && !holiday ? ["breakfast", "bento", "dinner"] : ["breakfast", "dinner"];

  const homeFor = (meal: "breakfast" | "dinner") => {
    const away = new Set(
      events
        .filter((e) => e.away_meals.includes(meal))
        .flatMap((e) => (e.member_ids.length ? e.member_ids : members.map((m) => m.id)))
    );
    return members.filter((m) => !away.has(m.id));
  };

  // お弁当は末っ子以外の子ども（長男・次男）
  const kids = members
    .filter((m) => m.role === "child")
    .sort((a, b) => (a.birth_date ?? "").localeCompare(b.birth_date ?? ""));
  const bentoKids = kids.slice(0, Math.max(kids.length - 1, 0));

  const title = (
    <span className={weekday(date) === 0 || holiday ? "text-red-600" : ""}>
      {d.getMonth() + 1}月{d.getDate()}日（{WEEKDAYS[d.getDay()]}）
      {holiday && <span className="ml-2 text-sm font-bold">{holiday}</span>}
    </span>
  );

  return (
    <Sheet title={title} onClose={onClose}>
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-500">予定</h2>
          <button onClick={onAddEvent} className="text-sm font-bold text-blue-600">
            ＋ 予定を追加
          </button>
        </div>
        {events.length === 0 && <p className="py-2 text-sm text-gray-400">予定はありません</p>}
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id}>
              <button
                onClick={() => onEditEvent(e)}
                className="flex w-full items-stretch gap-3 rounded-2xl bg-gray-50 p-3 text-left"
              >
                <span
                  className={`w-1.5 shrink-0 rounded-full ${e.tentative ? "opacity-40" : ""}`}
                  style={{ background: eventBackground(e.member_ids, members) }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">
                    {e.title}
                    {e.tentative && <span className="ml-2 text-xs font-normal text-gray-500">（仮）</span>}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {memberNames(e, members)}
                    {(e.start_time || e.end_time) &&
                      ` ・ ${e.start_time ? `${e.start_time} 外出` : ""}${e.start_time && e.end_time ? " → " : ""}${
                        e.end_time ? `${e.end_time} 帰宅` : ""
                      }`}
                  </span>
                  {e.away_meals.length > 0 && (
                    <span className="mt-1 flex gap-1">
                      {e.away_meals.map((m) => (
                        <span key={m} className="rounded bg-white px-1.5 text-[11px] text-gray-600 ring-1 ring-gray-200">
                          {AWAY_MEAL_LABEL[m]}ごはんは外
                        </span>
                      ))}
                    </span>
                  )}
                  {e.memo && <span className="mt-1 block text-xs text-gray-500">{e.memo}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold text-gray-500">献立</h2>
        <div className="space-y-4">
          {slots.map((slot) => {
            const plan = plans.find((p) => p.slot === slot) ?? null;
            const home = slot === "bento" ? null : homeFor(slot);
            return (
              <MealCard
                key={slot}
                date={date}
                slot={slot}
                plan={plan}
                members={members}
                subtitle={
                  slot === "bento"
                    ? bentoKids.map((m) => m.name).join("・")
                    : home && home.length < members.length
                    ? home.length === 0
                      ? "全員 外で食べる"
                      : `家で食べる：${home.map((m) => m.name).join("・")}`
                    : "全員 家で食べる"
                }
                label={MEAL_SLOT_LABEL[slot]}
                onChanged={onChanged}
              />
            );
          })}
        </div>
      </section>
    </Sheet>
  );
}

function memberNames(e: FamilyEvent, members: Member[]): string {
  if (e.member_ids.length === 0 || e.member_ids.length === members.length) return "家族みんな";
  return members
    .filter((m) => e.member_ids.includes(m.id))
    .map((m) => m.name)
    .join("・");
}
