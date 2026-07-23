"use client";

import { useEffect, useState } from "react";
import AdminBoard from "./AdminBoard";
import CalendarView from "./CalendarView";
import { addDays, toDateStr } from "@/lib/booking";

// 管理の予定表示：トグル・今日・前後・日付・日数を1行にまとめた共通ツールバー＋本体
export default function AdminSchedule() {
  const [view, setView] = useState<"board" | "calendar">("board");
  const [curDate, setCurDate] = useState<string>(toDateStr(new Date()));
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
  // 前後：カレンダーは表示日数ぶん、1日ボードは1日ずつ移動
  function shift(dir: number) {
    const step = view === "calendar" ? calDays : 1;
    setCurDate((d) => toDateStr(addDays(new Date(d + "T00:00:00"), dir * step)));
  }

  const arrowCls =
    "flex h-7 w-6 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-xs text-slate-500 active:bg-slate-100";

  return (
    <div>
      <div className="mb-2 flex items-center gap-1">
        <div className="inline-flex shrink-0 rounded-md border border-slate-300 bg-white p-0.5">
          <button
            onClick={() => choose("board")}
            className={`rounded px-1.5 py-1 text-[11px] font-bold ${
              view === "board" ? "bg-blue-600 text-white" : "text-slate-600"
            }`}
          >
            ボード
          </button>
          <button
            onClick={() => choose("calendar")}
            className={`rounded px-1.5 py-1 text-[11px] font-bold ${
              view === "calendar" ? "bg-blue-600 text-white" : "text-slate-600"
            }`}
          >
            カレンダー
          </button>
        </div>
        <button
          onClick={() => setCurDate(toDateStr(new Date()))}
          className="shrink-0 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white active:bg-blue-700"
        >
          今日
        </button>
        <button onClick={() => shift(-1)} className={arrowCls} aria-label="前へ">
          ‹
        </button>
        <button onClick={() => shift(1)} className={arrowCls} aria-label="次へ">
          ›
        </button>
        <input
          type="date"
          value={curDate}
          onChange={(e) => e.target.value && setCurDate(e.target.value)}
          className="min-w-0 rounded-md border border-slate-300 px-1 py-1 text-[11px] text-slate-600"
        />

        {view === "calendar" && (
          <div className="relative ml-auto shrink-0">
            <button
              onClick={() => setDayMenu((v) => !v)}
              className="flex h-7 items-center gap-0.5 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-bold text-slate-600 active:bg-slate-100"
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
        )}
      </div>

      {view === "board" ? (
        <AdminBoard date={curDate} />
      ) : (
        <CalendarView start={curDate} days={calDays} onStartChange={setCurDate} />
      )}
    </div>
  );
}
