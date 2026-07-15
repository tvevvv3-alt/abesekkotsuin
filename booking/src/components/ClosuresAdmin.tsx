"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadStaff } from "@/lib/data";
import type { Closure, Staff } from "@/lib/types";
import { labelToMin, minToLabel, toDateStr } from "@/lib/booking";

export default function ClosuresAdmin() {
  const supabase = useMemo(() => createClient(), []);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [loading, setLoading] = useState(true);

  // フォーム
  const [date, setDate] = useState(toDateStr(new Date()));
  const [staffId, setStaffId] = useState(""); // "" = 院全体
  const [allDay, setAllDay] = useState(true);
  const [from, setFrom] = useState("14:30");
  const [to, setTo] = useState("19:00");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const [st, { data }] = await Promise.all([
      loadStaff(supabase),
      supabase
        .from("closures")
        .select("*")
        .gte("date", toDateStr(new Date()))
        .order("date"),
    ]);
    setStaff(st);
    setClosures(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function add() {
    setBusy(true);
    await supabase.from("closures").insert({
      date,
      staff_id: staffId || null,
      start_min: allDay ? null : labelToMin(from),
      end_min: allDay ? null : labelToMin(to),
      reason: reason.trim() || null,
    });
    setReason("");
    setBusy(false);
    reload();
  }

  async function remove(id: string) {
    await supabase.from("closures").delete().eq("id", id);
    reload();
  }

  const staffName = (id: string | null) =>
    id === null ? "院全体" : staff.find((s) => s.id === id)?.name || "?";

  return (
    <div className="max-w-2xl">
      <h1 className="mb-3 text-lg font-bold text-slate-800">休診設定</h1>

      <div className="mb-4 rounded-xl border bg-white p-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-500">日付</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border px-2 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-500">対象</span>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="w-full rounded-md border px-2 py-1.5"
            >
              <option value="">院全体</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
          />
          終日
        </label>
        {!allDay && (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="time"
              step={300}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border px-2 py-1.5"
            />
            〜
            <input
              type="time"
              step={300}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border px-2 py-1.5"
            />
          </div>
        )}
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="理由（任意）"
          className="mt-3 w-full rounded-md border px-2 py-1.5 text-sm"
        />
        <button
          onClick={add}
          disabled={busy}
          className="mt-3 rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white disabled:bg-slate-300"
        >
          追加
        </button>
      </div>

      <h2 className="mb-2 text-sm font-bold text-slate-600">今後の休診</h2>
      {loading ? (
        <p className="text-sm text-slate-500">読み込み中…</p>
      ) : closures.length === 0 ? (
        <p className="text-sm text-slate-400">登録された休診はありません</p>
      ) : (
        <div className="space-y-1.5">
          {closures.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-lg border bg-white px-3 py-2 text-sm"
            >
              <div>
                <span className="font-medium">{c.date}</span>
                <span className="ml-2 text-slate-500">{staffName(c.staff_id)}</span>
                <span className="ml-2 text-xs text-slate-400">
                  {c.start_min === null
                    ? "終日"
                    : `${minToLabel(c.start_min)}–${minToLabel(c.end_min as number)}`}
                  {c.reason && ` / ${c.reason}`}
                </span>
              </div>
              <button onClick={() => remove(c.id)} className="text-xs text-red-500">
                削除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
