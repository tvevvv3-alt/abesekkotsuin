"use client";

import { useEffect, useState } from "react";
import AdminBoard from "./AdminBoard";
import CalendarView from "./CalendarView";
import { toDateStr } from "@/lib/booking";

// 管理の予定表示：トグル・今日・日付・日数を1行にまとめたツールバー＋本体
export default function AdminSchedule() {
  const [view, setView] = useState<"board" | "calendar">("board");
  const [todaySignal, setTodaySignal] = useState(0);
  const [calStart, setCalStart] = useState<string>(toDateStr(new Date()));
  const [calDays, setCalDays] = useState(3);
  const [dayMenu, setDayMenu] = useState(false);

  useEffect(() => {
    const v = localStorage.getItem("abe_sched_view");
    if (v === "board" || v === "calendar") setView(v);
  }, []);
  function choose(v: "board" | "calendar") {
    setView(v);
    localStorage.setItem("abe_sched_view", v);
  }
  function goToday() {
    setCalStart(toDateStr(new Date()));
    setTodaySignal((n) => n + 1);
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
          <button
            onClick={() => choose("board")}
            className={`rounded-md px-3 py-1.5 text-sm font-bold ${
              view === "board" ? "bg-blue-600 text-white" : "text-slate-600"
            }`}
          >
            1日ボード
          </button>
          <button
            onClick={() => choose("calendar")}
            className={`rounded-md px-3 py-1.5 text-sm font-bold ${
              view === "calendar" ? "bg-blue-600 text-white" : "text-slate-600"
            }`}
          >
            カレンダー
          </button>
        </div>
        <button
          onClick={goToday}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-bold text-white active:bg-blue-700"
        >
          今日
        </button>

        {view === "calendar" && (
          <>
            <input
              type="date"
              value={calStart}
              onChange={(e) => e.target.value && setCalStart(e.target.value)}
              className="rounded-lg border border-slate-300 px-1.5 py-1.5 text-xs text-slate-600"
            />
            <div className="relative ml-auto">
              <button
                onClick={() => setDayMenu((v) => !v)}
                className="flex h-8 items-center gap-0.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-600 active:bg-slate-100"
              >
                {calDays}日 <span className="text-[9px]">▾</span>
              </button>
              {dayMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setDayMenu(false)} />
                  <div className="absolute right-0 z-50 mt-1 w-20 overflow-hidden rounded-lg border bg-white shadow-lg">
                    {[1, 3, 4, 7].map((n) => (
                      <button
                        key={n}
                        onClick={() => {
                          setCalDays(n);
                          setDayMenu(false);
                        }}
                        className={`block w-full px-3 py-2 text-left text-sm ${
                          calDays === n
                            ? "bg-blue-600 font-bold text-white"
                            : "text-slate-600 active:bg-slate-100"
                        }`}
                      >
                        {n}日
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {view === "board" ? (
        <AdminBoard todaySignal={todaySignal} />
      ) : (
        <CalendarView start={calStart} days={calDays} onStartChange={setCalStart} />
      )}
    </div>
  );
}
