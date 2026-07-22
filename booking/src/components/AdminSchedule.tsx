"use client";

import { useState } from "react";
import AdminBoard from "./AdminBoard";
import CalendarView from "./CalendarView";

// 管理の予定表示：「1日ボード（ドラッグ予約追加）」と「カレンダー（複数日・スタッフ色）」を切り替え
export default function AdminSchedule() {
  const [view, setView] = useState<"board" | "calendar">("board");
  return (
    <div>
      <div className="mb-3 inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
        <button
          onClick={() => setView("board")}
          className={`rounded-md px-4 py-1.5 text-sm font-bold ${
            view === "board" ? "bg-blue-600 text-white" : "text-slate-600"
          }`}
        >
          1日ボード
        </button>
        <button
          onClick={() => setView("calendar")}
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
