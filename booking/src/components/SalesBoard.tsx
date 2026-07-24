"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadAllStaff } from "@/lib/data";
import { addDays, minToLabel, toDateStr, WEEKDAY_LABELS } from "@/lib/booking";
import type { Staff } from "@/lib/types";

interface Appt {
  id: string;
  date: string;
  start_min: number;
  staff_id: string | null;
  patient_name: string | null;
}
interface Sale {
  insurance: number;
  selfpay: number;
}

export default function SalesBoard() {
  const supabase = useMemo(() => createClient(), []);
  const [date, setDate] = useState(() => toDateStr(new Date()));
  const [staff, setStaff] = useState<Staff[]>([]);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [sales, setSales] = useState<Record<string, Sale>>({});
  const salesRef = useRef(sales);
  salesRef.current = sales;
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const monthStart = useMemo(() => date.slice(0, 8) + "01", [date]);
  const monthEnd = useMemo(() => {
    const [y, m] = date.split("-").map(Number);
    return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  }, [date]);

  useEffect(() => {
    (async () => {
      const st = await loadAllStaff(supabase);
      const vis = st.filter((s) => s.admin_visible && s.status !== "retired");
      setStaff(vis);
      const t: Record<string, number> = {};
      vis.forEach((s) => (t[s.id] = (s as unknown as { sales_target?: number }).sales_target ?? 0));
      setTargets(t);
    })();
  }, [supabase]);

  const reload = useCallback(async () => {
    setLoading(true);
    const [{ data: ap }, { data: sl }] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, date, start_min, staff_id, patient_name")
        .neq("status", "cancelled")
        .gte("date", monthStart)
        .lt("date", monthEnd)
        .order("start_min"),
      supabase
        .from("sales")
        .select("appointment_id, insurance, selfpay")
        .gte("date", monthStart)
        .lt("date", monthEnd),
    ]);
    setAppts((ap as Appt[]) ?? []);
    const m: Record<string, Sale> = {};
    (sl ?? []).forEach((s: { appointment_id: string | null; insurance: number; selfpay: number }) => {
      if (s.appointment_id) m[s.appointment_id] = { insurance: s.insurance, selfpay: s.selfpay };
    });
    setSales(m);
    setLoading(false);
  }, [supabase, monthStart, monthEnd]);

  useEffect(() => {
    reload();
  }, [reload]);

  function setLocal(id: string, field: keyof Sale, val: number) {
    setSales((prev) => {
      const cur = prev[id] ?? { insurance: 0, selfpay: 0 };
      return { ...prev, [id]: { ...cur, [field]: val } };
    });
  }
  async function persist(a: Appt) {
    const s = salesRef.current[a.id] ?? { insurance: 0, selfpay: 0 };
    await supabase.from("sales").upsert(
      {
        appointment_id: a.id,
        date: a.date,
        staff_id: a.staff_id,
        patient_name: a.patient_name,
        insurance: s.insurance,
        selfpay: s.selfpay,
      },
      { onConflict: "appointment_id" }
    );
  }
  async function saveTarget(staffId: string, man: number) {
    const yen = Math.max(0, Math.round(man * 10000));
    setTargets((t) => ({ ...t, [staffId]: yen }));
    await supabase.from("staff").update({ sales_target: yen }).eq("id", staffId);
  }

  const dayAppts = useMemo(() => appts.filter((a) => a.date === date), [appts, date]);
  const dayByStaff = useCallback(
    (staffId: string) => dayAppts.filter((a) => a.staff_id === staffId),
    [dayAppts]
  );
  const monthTotal = useCallback(
    (staffId: string) =>
      appts
        .filter((a) => a.staff_id === staffId)
        .reduce((sum, a) => {
          const s = sales[a.id];
          return sum + (s ? s.insurance + s.selfpay : 0);
        }, 0),
    [appts, sales]
  );
  const dayTotal = useCallback(
    (staffId: string) =>
      dayByStaff(staffId).reduce((sum, a) => {
        const s = sales[a.id];
        return sum + (s ? s.insurance + s.selfpay : 0);
      }, 0),
    [dayByStaff, sales]
  );

  const yen = (n: number) => "¥" + n.toLocaleString();
  const d = new Date(date + "T00:00:00");
  const monthLabel = `${d.getFullYear()}年${d.getMonth() + 1}月`;
  const grandMonth = staff.reduce((s, st) => s + monthTotal(st.id), 0);
  const btn =
    "flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 active:bg-slate-100";
  const amtInput =
    "w-20 rounded border border-slate-300 px-1 py-1 text-right text-sm tabnum focus:border-blue-400 focus:outline-none";

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800">個別売上</h1>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setDate(toDateStr(addDays(d, -1)))} className={btn} aria-label="前の日">
            ‹
          </button>
          <button
            onClick={() => setDate(toDateStr(new Date()))}
            className="rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white active:bg-blue-700"
          >
            今日
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-md border border-slate-300 px-1 py-1 text-[12px] text-slate-600"
          />
          <button onClick={() => setDate(toDateStr(addDays(d, 1)))} className={btn} aria-label="次の日">
            ›
          </button>
        </div>
      </div>

      {/* 当月サマリー（担当ごとの総売上・目標・達成率） */}
      <div className="mb-4 rounded-xl border bg-white p-3">
        <div className="mb-2 flex items-baseline gap-2">
          <span className="text-sm font-bold text-slate-700">{monthLabel} 当月サマリー</span>
          <span className="ml-auto text-sm font-bold text-slate-800">
            総売上 {yen(grandMonth)}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {staff.map((s) => {
            const total = monthTotal(s.id);
            const target = targets[s.id] ?? 0;
            const pct = target > 0 ? Math.round((total / target) * 1000) / 10 : 0;
            return (
              <div key={s.id} className="rounded-lg border p-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: s.color || "#64748b" }}
                  />
                  <span className="text-sm font-bold text-slate-800">{s.name}</span>
                  <span className="ml-auto flex items-center gap-1 text-[11px] text-slate-400">
                    目標
                    <input
                      type="number"
                      min={0}
                      value={target ? target / 10000 : ""}
                      onChange={(e) => saveTarget(s.id, parseFloat(e.target.value || "0"))}
                      className="w-14 rounded border border-slate-300 px-1 py-0.5 text-right text-[11px]"
                      placeholder="0"
                    />
                    万円
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-base font-bold tabnum text-slate-800">{yen(total)}</span>
                  {target > 0 && (
                    <span
                      className={`text-xs font-bold ${
                        pct >= 100 ? "text-emerald-600" : pct >= 70 ? "text-blue-600" : "text-slate-500"
                      }`}
                    >
                      {pct}%
                    </span>
                  )}
                </div>
                {target > 0 && (
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${Math.min(100, pct)}%`, backgroundColor: s.color || undefined }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* その日の入力（予約から自動、保険/自費を手入力） */}
      <div className="mb-1 flex items-center gap-2">
        <span className="text-sm font-bold text-slate-700">
          {d.getMonth() + 1}/{d.getDate()}（{WEEKDAY_LABELS[d.getDay()]}）の売上入力
        </span>
        <span className="ml-auto text-sm font-bold text-slate-800">
          本日 {yen(staff.reduce((s, st) => s + dayTotal(st.id), 0))}
        </span>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">読み込み中…</p>
      ) : dayAppts.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">この日の予約はありません。</p>
      ) : (
        <div className="space-y-3">
          {staff.map((s) => {
            const list = dayByStaff(s.id);
            if (list.length === 0) return null;
            return (
              <div key={s.id} className="overflow-hidden rounded-xl border bg-white">
                <div className="flex items-center gap-1.5 border-b bg-slate-50 px-3 py-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: s.color || "#64748b" }}
                  />
                  <span className="text-sm font-bold text-slate-800">{s.name}</span>
                  <span className="ml-auto text-sm font-bold tabnum text-slate-700">
                    {yen(dayTotal(s.id))}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] text-slate-400">
                      <th className="px-3 py-1 text-left font-bold">名前</th>
                      <th className="px-1 py-1 text-right font-bold">保険</th>
                      <th className="px-1 py-1 text-right font-bold">自費</th>
                      <th className="px-3 py-1 text-right font-bold">合計</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {list.map((a) => {
                      const sale = sales[a.id] ?? { insurance: 0, selfpay: 0 };
                      return (
                        <tr key={a.id}>
                          <td className="px-3 py-1.5">
                            <div className="font-medium text-slate-800">
                              {a.patient_name || "（未登録）"}
                            </div>
                            <div className="text-[10px] text-slate-400">{minToLabel(a.start_min)}</div>
                          </td>
                          <td className="px-1 py-1.5 text-right">
                            <input
                              type="number"
                              min={0}
                              value={sale.insurance || ""}
                              placeholder="0"
                              onChange={(e) => setLocal(a.id, "insurance", parseInt(e.target.value || "0", 10))}
                              onBlur={() => persist(a)}
                              className={amtInput}
                            />
                          </td>
                          <td className="px-1 py-1.5 text-right">
                            <input
                              type="number"
                              min={0}
                              value={sale.selfpay || ""}
                              placeholder="0"
                              onChange={(e) => setLocal(a.id, "selfpay", parseInt(e.target.value || "0", 10))}
                              onBlur={() => persist(a)}
                              className={amtInput}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right font-bold tabnum text-slate-800">
                            {yen(sale.insurance + sale.selfpay)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-400">
        名前・担当はその日の予約から自動表示されます。保険合計額と自費を入力すると合計・当月総売上・
        達成率が自動集計されます（金額は入力欄からいつでも修正可）。目標は担当ごとに万円で保存されます。
      </p>
    </div>
  );
}
