"use client";

import { useEffect, useState } from "react";
import AdminBoard from "./AdminBoard";
import CalendarView from "./CalendarView";

// 管理の予定表示：「1日ボード」と「カレンダー」を切替。今日ボタンはトグルの横。
export default function AdminSchedule() {
  const [view, setView] = useState<"board" | "calendar">("board");
  const [todaySignal, setTodaySignal] = useState(0);

  useEffect(() => {
    const v = localStorage.getItem("abe_sched_view");
    if (v === "board" || v === "calendar") setView(v);
  }, []);
  function choose(v: "board" | "calendar") {
    setView(v);
    localStorage.setItem("abe_sched_view", v);
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-4">
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
          <button
            onClick={() => choose("board")}
            className={`rounded-md px-4 py-1.5 text-sm font-bold ${
              view === "board" ? "bg-blue-600 text-white" : "text-slate-600"
            }`}
          >
            1日ボード
          </button>
          <button
            onClick={() => choose("calendar")}
            className={`rounded-md px-4 py-1.5 text-sm font-bold ${
              view === "calendar" ? "bg-blue-600 text-white" : "text-slate-600"
            }`}
          >
            カレンダー
          </button>
        </div>
        <button
          onClick={() => setTodaySignal((n) => n + 1)}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-bold text-white active:bg-blue-700"
        >
          今日
        </button>
      </div>
      {view === "board" ? (
        <AdminBoard todaySignal={todaySignal} />
      ) : (
        <CalendarView todaySignal={todaySignal} />
      )}
    </div>
  );
}
