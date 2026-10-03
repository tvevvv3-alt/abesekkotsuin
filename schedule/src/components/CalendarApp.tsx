"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, makePlan } from "@/lib/api";
import { WEEKDAYS, addDays, isBentoDay, monthGrid, parseDateStr, toDateStr, weekday } from "@/lib/date";
import { holidayName } from "@/lib/holidays";
import { AWAY_MEAL_LABEL, eventBackground } from "@/lib/labels";
import { dayHasRice } from "@/lib/rice";
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
  const [planning, setPlanning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [replanFrom, setReplanFrom] = useState<string | null>(null);

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

  // AI に献立を作ってもらう（既定は from から7日間）。選んだ献立は残る
  const runPlan = async (from: string, to = addDays(from, 6)) => {
    setReplanFrom(null);
    setPlanning(true);
    try {
      const r = await makePlan(from, to, today);
      setNotice(r.note);
      setError(null);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPlanning(false);
    }
  };

  // 予定を変えた日以降に献立があれば、組み替えを提案する
  const afterEventSaved = (date: string) => {
    if (date < today) return;
    if (plans.some((p) => p.date >= date)) setReplanFrom(date);
  };
  const replanTo = (from: string) => {
    const last = plans.reduce((m, p) => (p.date > m ? p.date : m), from);
    const cap = addDays(from, 13);
    return last > cap ? cap : last < addDays(from, 6) ? addDays(from, 6) : last;
  };

  const shiftMonth = (n: number) =>
    setYm(({ y, m }) => {
      const d = new Date(y, m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  // 左右スワイプで月移動（縦スクロール中に誤って月が変わらないよう、横方向がはっきりしたときだけ）
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) =>
    (touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY });
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2) shiftMonth(dx < 0 ? 1 : -1);
    touchStart.current = null;
  };

  // 日付はスマホの時計で決める。サーバーで作ったHTMLの日付（公開した日）が残らないよう、表示は端末で行う
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const eventsByDate = useMemo(() => {
    const map: Record<string, FamilyEvent[]> = {};
    for (const e of events) (map[e.date] ??= []).push(e);
    return map;
  }, [events]);

  const plansByDate = useMemo(() => {
    const map: Record<string, MealPlan[]> = {};
    for (const p of plans) (map[p.date] ??= []).push(p);
    return map;
  }, [plans]);

  if (!mounted) return null;

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
        <div className="flex gap-2">
        <button
          onClick={() => runPlan(today)}
          disabled={planning}
          className="flex h-12 items-center justify-center rounded-full bg-black px-4 text-sm font-bold text-white shadow-[0_2px_12px_rgba(0,0,0,0.12)] disabled:opacity-50"
        >
          🍳 献立
        </button>
        <button
          onClick={() => setYm({ y: new Date().getFullYear(), m: new Date().getMonth() })}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-sm font-bold shadow-[0_2px_12px_rgba(0,0,0,0.12)]"
          aria-label="今月に戻る"
        >
          今日
        </button>
        </div>
      </header>

      {error && <p className="mx-4 mb-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && (
        <div className="mx-4 mb-2 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <p className="flex-1">
            <span className="font-bold">献立を作りました。</span>
            {notice}
          </p>
          <button onClick={() => setNotice(null)} aria-label="閉じる" className="self-start text-amber-700">
            ✕
          </button>
        </div>
      )}
      {replanFrom && !planning && (
        <div className="mx-4 mb-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
          <p>
            予定が変わりました。{fmt(replanFrom)}以降の、まだ選んでいない献立を組み替えますか？
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => runPlan(replanFrom, replanTo(replanFrom))}
              className="rounded-lg bg-blue-600 px-3 py-1.5 font-bold text-white"
            >
              組み替える
            </button>
            <button onClick={() => setReplanFrom(null)} className="rounded-lg px-3 py-1.5 text-blue-700">
              あとで
            </button>
          </div>
        </div>
      )}

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
                  {plansByDate[date] && <span>{dayHasRice(plansByDate[date]) ? "🍚" : "🍽"}</span>}
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
          allPlans={plans}
          planning={planning}
          onPlan={(from) => {
            setSelected(null);
            const hasLater = plans.some((p) => p.date >= from);
            runPlan(from, hasLater ? replanTo(from) : addDays(from, 6));
          }}
          onClose={() => setSelected(null)}
          onAddEvent={() => setEditing({ date: selected })}
          onEditEvent={(event) => setEditing({ date: event.date, event })}
          onChanged={reload}
        />
      )}

      {planning && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-black" />
            <p className="font-bold">献立を考えています…</p>
            <p className="mt-1 text-sm text-gray-500">予定と家にある食材から選んでいます</p>
          </div>
        </div>
      )}

      {editing && (
        <EventForm
          date={editing.date}
          event={editing.event}
          members={members}
          onClose={() => setEditing(null)}
          onSaved={(date) => {
            setEditing(null);
            reload();
            afterEventSaved(date);
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

function fmt(date: string): string {
  const d = parseDateStr(date);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
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
