"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadServices } from "@/lib/data";
import { addDays, minToLabel, toDateStr, WEEKDAY_LABELS } from "@/lib/booking";
import type { ServiceWithSteps } from "@/lib/types";

interface Row {
  id: string;
  date: string;
  start_min: number;
  patient_name: string | null;
  status: "booked" | "cancelled" | "done";
  line_user_id: string | null;
  note: string | null;
}

export default function ClassRoster() {
  const supabase = useMemo(() => createClient(), []);
  const [classes, setClasses] = useState<ServiceWithSteps[]>([]);
  const [classId, setClassId] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // 表示範囲：過去14日〜先60日
  const from = useMemo(() => toDateStr(addDays(new Date(), -14)), []);
  const to = useMemo(() => toDateStr(addDays(new Date(), 60)), []);

  useEffect(() => {
    (async () => {
      try {
        const sv = await loadServices(supabase);
        const cls = sv.filter((s) => s.capacity > 1);
        setClasses(cls);
        if (cls[0]) setClassId(cls[0].id);
      } catch {
        /* noop */
      }
    })();
  }, [supabase]);

  const reload = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    const { data } = await supabase
      .from("appointments")
      .select("id, date, start_min, patient_name, status, line_user_id, note")
      .eq("service_id", classId)
      .neq("status", "cancelled")
      .gte("date", from)
      .lte("date", to)
      .order("date")
      .order("start_min");
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }, [supabase, classId, from, to]);

  useEffect(() => {
    reload();
  }, [reload]);

  // 日付ごとにまとめる
  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const arr = map.get(r.date) ?? [];
      arr.push(r);
      map.set(r.date, arr);
    }
    return Array.from(map.entries());
  }, [rows]);

  async function finish(r: Row) {
    setBusy(r.id);
    setMsg(null);
    // 予約を「終了(done)」に
    await supabase.from("appointments").update({ status: "done" }).eq("id", r.id);
    // LINE送信（連携済みのみ）
    let note = "終了にしました";
    if (r.line_user_id) {
      try {
        const res = await fetch("/api/class/done", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appointmentId: r.id }),
        });
        const j = (await res.json()) as { ok: boolean; reason?: string };
        note = j.ok ? "終了＋LINE送信しました" : `終了（LINE未送信: ${j.reason ?? "?"}）`;
      } catch {
        note = "終了（LINE送信エラー）";
      }
    } else {
      note = "終了にしました（LINE未連携）";
    }
    setBusy(null);
    setMsg(note);
    reload();
  }

  const todayStr = toDateStr(new Date());

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800">体幹教室 予約一覧</h1>
        {classes.length > 1 && (
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {msg && (
        <div className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">{msg}</div>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">読み込み中…</p>
      ) : groups.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">予約がありません。</p>
      ) : (
        <div className="space-y-4">
          {groups.map(([date, list]) => {
            const d = new Date(date + "T00:00:00");
            const isToday = date === todayStr;
            return (
              <div key={date} className="overflow-hidden rounded-xl border bg-white">
                <div
                  className={`flex items-center justify-between border-b px-4 py-2 text-sm font-bold ${
                    isToday ? "bg-blue-50 text-blue-700" : "bg-slate-50 text-slate-700"
                  }`}
                >
                  <span>
                    {d.getMonth() + 1}/{d.getDate()}（{WEEKDAY_LABELS[d.getDay()]}）
                    {isToday && " ・今日"}
                  </span>
                  <span className="text-xs font-normal text-slate-500">{list.length}名</span>
                </div>
                <ul className="divide-y">
                  {list.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-12 shrink-0 text-sm font-bold text-slate-600">
                        {minToLabel(r.start_min)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                        {r.patient_name || "（未登録）"}
                      </span>
                      {r.line_user_id ? (
                        <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
                          LINE
                        </span>
                      ) : (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400">
                          未連携
                        </span>
                      )}
                      {r.status === "done" ? (
                        <span className="w-24 shrink-0 text-right text-xs font-bold text-slate-400">
                          済
                        </span>
                      ) : (
                        <button
                          onClick={() => finish(r)}
                          disabled={busy === r.id}
                          className="w-24 shrink-0 rounded-lg bg-blue-600 py-1.5 text-xs font-bold text-white active:bg-blue-700 disabled:bg-slate-300"
                        >
                          {busy === r.id ? "処理中…" : "終了"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-400">
        「終了」を押すと予約を終了にし、LINE連携済みの方へお礼＋次回予約の案内を送ります。
      </p>
    </div>
  );
}
