"use client";

import { useEffect, useState } from "react";
import AdminBoard from "./AdminBoard";
import CalendarView from "./CalendarView";

// 管理の予定表示：「1日ボード（担当ごとの列・ドラッグ予約追加）」と「カレンダー（複数日・拡大縮小）」を切替
export default function AdminSchedule() {
  const [view, setView] = useState<"board" | "calendar">("board");

  // 直近の選択を記憶
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
      <div className="mb-3 inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
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
      {view === "board" ? <AdminBoard /> : <CalendarView />}
    </div>
  );
}
