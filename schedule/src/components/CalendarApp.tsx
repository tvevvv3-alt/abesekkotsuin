"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { WEEKDAYS, isBentoDay, monthGrid, toDateStr, weekday } from "@/lib/date";
import { holidayName } from "@/lib/holidays";
import { AWAY_MEAL_LABEL, eventBackground } from "@/lib/labels";
import type { FamilyEvent, MealPlan, Member } from "@/lib/types";
import Drawer, { DrawerTab } from "./Drawer";
import DaySheet from "./DaySheet";
import EventForm from "./EventForm";

export default function CalendarApp() {
  const today = toDateStr(new Date());
  const [ym, setYm] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ date: string; event?: FamilyEvent } | null>(null);

  const weeks = useMemo(() => monthGrid(ym.y, ym.m), [ym]);
  const range = useMemo(() => ({ from: weeks[0][0], to: weeks[weeks.length - 1][6] }), [weeks]);

  const reload = useCallback(async () => {
    try {
      const [ms, es, ps] = await Promise.all([
        api.list<Member>("members"),
        api.list<FamilyEvent>("events", range),
        api.list<MealPlan>("meal_plans", range),
      ]);
      setMembers(ms);
      setEvents(es);
      setPlans(ps);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [range]);

  useEffect(() => {
    reload();
  }, [reload]);

  const shiftMonth = (n: number) =>
    setYm(({ y, m }) => {
      const d = new Date(y, m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  // 左右スワイプで月移動
  const touchX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => (touchX.current = e.touches[0].clientX);
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 60) shiftMonth(dx < 0 ? 1 : -1);
    touchX.current = null;
  };

  const eventsByDate = useMemo(() => {
    const map: Record<string, FamilyEvent[]> = {};
    for (const e of events) (map[e.date] ??= []).push(e);
    return map;
  }, [events]);

  const plannedDates = useMemo(() => new Set(plans.map((p) => p.date)), [plans]);

  return (
    <div className="pb-28" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <DrawerTab onClick={() => setDrawer(true)} />
      <Drawer open={drawer} onClose={() => setDrawer(false)} />

      <header className="flex items-center justify-between px-5 pb-2 pt-6">
        <label className="relative flex items-center gap-1 text-[28px] font-extrabold tracking-tight">
          {ym.y}年{ym.m + 1}月<span className="text-base">▼</span>
          <input
            type="month"
            aria-label="年月を選ぶ"
            className="absolute inset-0 opacity-0"
            value={`${ym.y}-${String(ym.m + 1).padStart(2, "0")}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number);
              if (y && m) setYm({ y, m: m - 1 });
            }}
          />
        </label>
        <button
          onClick={() => setYm({ y: new Date().getFullYear(), m: new Date().getMonth() })}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-sm font-bold shadow-[0_2px_12px_rgba(0,0,0,0.12)]"
          aria-label="今月に戻る"
        >
          今日
        </button>
      </header>

      {error && <p className="mx-4 mb-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-7 border-b border-gray-200 text-center text-sm">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`py-2 ${i === 0 ? "text-red-600" : "text-gray-600"}`}>
            {w}
          </div>
        ))}
      </div>

      {weeks.map((week) => (
        <div key={week[0]} className="grid min-h-[104px] grid-cols-7 border-b border-gray-100">
          {week.map((date) => {
            const inMonth = Number(date.slice(5, 7)) === ym.m + 1;
            const holiday = holidayName(date);
            const red = weekday(date) === 0 || !!holiday;
            const dayEvents = eventsByDate[date] ?? [];
            const away = awaySummary(dayEvents, members);
            return (
              <button
                key={date}
                onClick={() => setSelected(date)}
                className={`flex min-w-0 flex-col items-stretch gap-[3px] px-[2px] pb-1 pt-1.5 text-left ${
                  inMonth ? "" : "opacity-35"
                }`}
              >
                <span className="flex justify-center">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-[17px] font-bold ${
                      date === today ? "bg-black text-white" : red ? "text-red-600" : ""
                    }`}
                  >
                    {Number(date.slice(8))}
                  </span>
                </span>
                {dayEvents.slice(0, 3).map((e) => (
                  <EventChip key={e.id} event={e} members={members} />
                ))}
                {dayEvents.length > 3 && (
                  <span className="text-center text-[10px] text-gray-500">+{dayEvents.length - 3}</span>
                )}
                <span className="mt-auto flex flex-wrap justify-center gap-x-1 text-[10px] leading-tight text-gray-500">
                  {isBentoDay(date) && !holiday && <span>🍙</span>}
                  {plannedDates.has(date) && <span>🍚</span>}
                  {away && <span className="text-gray-600">{away}</span>}
                </span>
              </button>
            );
          })}
        </div>
      ))}

      <button
        onClick={() => setEditing({ date: selected ?? today })}
        aria-label="予定を追加"
        className="fixed bottom-8 right-[max(1.5rem,calc(50%-15rem))] z-20 flex h-16 w-16 items-center justify-center rounded-full bg-black text-4xl font-light text-white shadow-lg"
      >
        +
      </button>

      {selected && (
        <DaySheet
          date={selected}
          members={members}
          events={eventsByDate[selected] ?? []}
          plans={plans.filter((p) => p.date === selected)}
          onClose={() => setSelected(null)}
          onAddEvent={() => setEditing({ date: selected })}
          onEditEvent={(event) => setEditing({ date: event.date, event })}
          onChanged={reload}
        />
      )}

      {editing && (
        <EventForm
          date={editing.date}
          event={editing.event}
          members={members}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

export function EventChip({ event, members }: { event: FamilyEvent; members: Member[] }) {
  const bg = eventBackground(event.member_ids, members);
  const firstColor = members.find((m) => m.id === event.member_ids[0])?.color ?? "#64748b";
  if (event.tentative) {
    return (
      <span className="relative block overflow-hidden rounded px-1 py-[1px] text-[11px] font-bold leading-4">
        <span className="tentative absolute inset-0 opacity-25" style={{ background: bg }} />
        <span className="tentative absolute inset-0" />
        <span className="relative block overflow-hidden whitespace-nowrap" style={{ color: firstColor }}>
          {event.title}
        </span>
      </span>
    );
  }
  return (
    <span
      className="block overflow-hidden whitespace-nowrap rounded px-[3px] py-[1px] text-[11px] font-bold leading-4 text-white"
      style={{ background: bg }}
    >
      {event.title}
    </span>
  );
}

// 「夕✕父」のように、家で食べない人をまとめて表示
function awaySummary(events: FamilyEvent[], members: Member[]): string | null {
  const parts: string[] = [];
  for (const meal of ["breakfast", "dinner"] as const) {
    const ids = new Set(events.filter((e) => e.away_meals.includes(meal)).flatMap((e) => (e.member_ids.length ? e.member_ids : members.map((m) => m.id))));
    if (ids.size === 0) continue;
    const names = members.filter((m) => ids.has(m.id)).map((m) => m.name.slice(0, 1));
    parts.push(`${AWAY_MEAL_LABEL[meal]}✕${names.length === members.length ? "全" : names.join("")}`);
  }
  return parts.length ? parts.join(" ") : null;
}
