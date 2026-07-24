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
  id: string;
  appointment_id: string | null;
  date: string;
  staff_id: string | null;
  patient_name: string | null;
  selfpay: number;
}
interface Daily {
  insurance_total: number;
  burden: number;
}

export default function SalesBoard() {
  const supabase = useMemo(() => createClient(), []);
  const [date, setDate] = useState(() => toDateStr(new Date()));
  const [staff, setStaff] = useState<Staff[]>([]);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const salesRef = useRef(sales);
  salesRef.current = sales;
  const [daily, setDaily] = useState<Record<string, Daily>>({});
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
    const [{ data: ap }, { data: sl }, { data: dl }] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, date, start_min, staff_id, patient_name")
        .neq("status", "cancelled")
        .gte("date", monthStart)
        .lt("date", monthEnd)
        .order("start_min"),
      supabase
        .from("sales")
        .select("id, appointment_id, date, staff_id, patient_name, selfpay")
        .gte("date", monthStart)
        .lt("date", monthEnd),
      supabase
        .from("sales_daily")
        .select("date, insurance_total, burden")
        .gte("date", monthStart)
        .lt("date", monthEnd),
    ]);
    setAppts((ap as Appt[]) ?? []);
    setSales((sl as Sale[]) ?? []);
    const dm: Record<string, Daily> = {};
    (dl ?? []).forEach((d: { date: string; insurance_total: number; burden: number }) => {
      dm[d.date] = { insurance_total: d.insurance_total, burden: d.burden };
    });
    setDaily(dm);
    setLoading(false);
  }, [supabase, monthStart, monthEnd]);

  useEffect(() => {
    reload();
  }, [reload]);

  // 予約に紐づく自費（appointment_id→sale）
  const saleByAppt = useMemo(() => {
    const m: Record<string, Sale> = {};
    sales.forEach((s) => {
      if (s.appointment_id) m[s.appointment_id] = s;
    });
    return m;
  }, [sales]);
  const manualSales = useMemo(() => sales.filter((s) => !s.appointment_id), [sales]);

  // --- 予約行の自費を保存（appointment_idでupsert） ---
  function setApptSelfpayLocal(a: Appt, val: number) {
    setSales((prev) => {
      const idx = prev.findIndex((s) => s.appointment_id === a.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], selfpay: val };
        return next;
      }
      return [
        ...prev,
        {
          id: "tmp-" + a.id,
          appointment_id: a.id,
          date: a.date,
          staff_id: a.staff_id,
          patient_name: a.patient_name,
          selfpay: val,
        },
      ];
    });
  }
  async function persistAppt(a: Appt) {
    const s = salesRef.current.find((x) => x.appointment_id === a.id);
    await supabase.from("sales").upsert(
      {
        appointment_id: a.id,
        date: a.date,
        staff_id: a.staff_id,
        patient_name: a.patient_name,
        selfpay: s?.selfpay ?? 0,
        insurance: 0,
      },
      { onConflict: "appointment_id" }
    );
    reload();
  }

  // --- 手動行（物販・その他） ---
  async function addManual() {
    const { data } = await supabase
      .from("sales")
      .insert({ date, staff_id: null, patient_name: "", selfpay: 0, insurance: 0 })
      .select("id, appointment_id, date, staff_id, patient_name, selfpay")
      .single();
    if (data) setSales((prev) => [...prev, data as Sale]);
  }
  function setManualLocal(id: string, patch: Partial<Sale>) {
    setSales((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  async function persistManual(id: string) {
    const s = salesRef.current.find((x) => x.id === id);
    if (!s) return;
    await supabase
      .from("sales")
      .update({ staff_id: s.staff_id, patient_name: s.patient_name, selfpay: s.selfpay })
      .eq("id", id);
  }
  async function deleteManual(id: string) {
    setSales((prev) => prev.filter((s) => s.id !== id));
    await supabase.from("sales").delete().eq("id", id);
  }

  // --- レセコン日計 ---
  function setDailyLocal(field: keyof Daily, val: number) {
    setDaily((prev) => {
      const cur = prev[date] ?? { insurance_total: 0, burden: 0 };
      return { ...prev, [date]: { ...cur, [field]: val } };
    });
  }
  async function persistDaily() {
    const d = daily[date] ?? { insurance_total: 0, burden: 0 };
    await supabase
      .from("sales_daily")
      .upsert({ date, insurance_total: d.insurance_total, burden: d.burden }, { onConflict: "date" });
  }
  async function saveTarget(staffId: string, man: number) {
    const yenv = Math.max(0, Math.round(man * 10000));
    setTargets((t) => ({ ...t, [staffId]: yenv }));
    await supabase.from("staff").update({ sales_target: yenv }).eq("id", staffId);
  }

  // --- 集計 ---
  const selfpayByStaff = useCallback(
    (staffId: string | null) =>
      sales.reduce((sum, s) => (s.staff_id === staffId ? sum + s.selfpay : sum), 0),
    [sales]
  );
  const selfpayTotal = useMemo(() => sales.reduce((s, x) => s + x.selfpay, 0), [sales]);
  const insuranceMonth = useMemo(
    () => Object.values(daily).reduce((s, d) => s + d.insurance_total, 0),
    [daily]
  );

  const dayAppts = useMemo(() => appts.filter((a) => a.date === date), [appts, date]);
  const dayManual = useMemo(() => manualSales.filter((s) => s.date === date), [manualSales, date]);

  const yen = (n: number) => "¥" + n.toLocaleString();
  const d = new Date(date + "T00:00:00");
  const monthLabel = `${d.getFullYear()}年${d.getMonth() + 1}月`;
  const dl = daily[date] ?? { insurance_total: 0, burden: 0 };
  const btn =
    "flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 active:bg-slate-100";
  const amt = "w-24 rounded border border-slate-300 px-1 py-1 text-right text-sm tabnum focus:border-blue-400 focus:outline-none";

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

      {/* 当月サマリー */}
      <div className="mb-4 rounded-xl border bg-white p-3">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <span className="font-bold text-slate-700">{monthLabel} 当月</span>
          <span className="text-slate-500">
            保険合計 <b className="tabnum text-slate-700">{yen(insuranceMonth)}</b>
          </span>
          <span className="text-slate-500">
            自費合計 <b className="tabnum text-slate-700">{yen(selfpayTotal)}</b>
          </span>
          <span className="ml-auto font-bold text-slate-800">
            総売上 {yen(insuranceMonth + selfpayTotal)}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {staff.map((s) => {
            const total = selfpayByStaff(s.id);
            const target = targets[s.id] ?? 0;
            const pct = target > 0 ? Math.round((total / target) * 1000) / 10 : 0;
            return (
              <div key={s.id} className="rounded-lg border p-2">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color || "#64748b" }} />
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
                    万
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-base font-bold tabnum text-slate-800">{yen(total)}</span>
                  {target > 0 && (
                    <span className={`text-xs font-bold ${pct >= 100 ? "text-emerald-600" : pct >= 70 ? "text-blue-600" : "text-slate-500"}`}>
                      {pct}%
                    </span>
                  )}
                </div>
                {target > 0 && (
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: s.color || "#3b82f6" }} />
                  </div>
                )}
              </div>
            );
          })}
          <div className="rounded-lg border p-2">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
              <span className="text-sm font-bold text-slate-800">物販・その他</span>
            </div>
            <div className="mt-1 text-base font-bold tabnum text-slate-800">{yen(selfpayByStaff(null))}</div>
          </div>
        </div>
      </div>

      {/* レセコン日計（保険側） */}
      <div className="mb-3 rounded-xl border bg-white p-3">
        <div className="mb-2 text-sm font-bold text-slate-700">
          {d.getMonth() + 1}/{d.getDate()}（{WEEKDAY_LABELS[d.getDay()]}）レセコン日計（保険）
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
          <label className="flex items-center gap-1">
            合計額（保険総額）
            <input type="number" min={0} value={dl.insurance_total || ""} placeholder="0"
              onChange={(e) => setDailyLocal("insurance_total", parseInt(e.target.value || "0", 10))}
              onBlur={persistDaily} className={amt} />
          </label>
          <label className="flex items-center gap-1">
            負担額／入金額
            <input type="number" min={0} value={dl.burden || ""} placeholder="0"
              onChange={(e) => setDailyLocal("burden", parseInt(e.target.value || "0", 10))}
              onBlur={persistDaily} className={amt} />
          </label>
        </div>
      </div>

      {/* その日の自費入力（予約から自動） */}
      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">読み込み中…</p>
      ) : (
        <div className="space-y-3">
          {staff.map((s) => {
            const list = dayAppts.filter((a) => a.staff_id === s.id);
            if (list.length === 0) return null;
            const sub = list.reduce((sum, a) => sum + (saleByAppt[a.id]?.selfpay ?? 0), 0);
            return (
              <div key={s.id} className="overflow-hidden rounded-xl border bg-white">
                <div className="flex items-center gap-1.5 border-b bg-slate-50 px-3 py-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color || "#64748b" }} />
                  <span className="text-sm font-bold text-slate-800">{s.name}</span>
                  <span className="ml-auto text-sm font-bold tabnum text-slate-700">自費 {yen(sub)}</span>
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y">
                    {list.map((a) => (
                      <tr key={a.id}>
                        <td className="px-3 py-1.5">
                          <span className="font-medium text-slate-800">{a.patient_name || "（未登録）"}</span>
                          <span className="ml-2 text-[10px] text-slate-400">{minToLabel(a.start_min)}</span>
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <input type="number" min={0} placeholder="0"
                            value={saleByAppt[a.id]?.selfpay || ""}
                            onChange={(e) => setApptSelfpayLocal(a, parseInt(e.target.value || "0", 10))}
                            onBlur={() => persistAppt(a)}
                            className={amt} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}

          {/* 手動追加（物販・その他・予約外） */}
          <div className="overflow-hidden rounded-xl border bg-white">
            <div className="flex items-center gap-1.5 border-b bg-slate-50 px-3 py-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
              <span className="text-sm font-bold text-slate-800">手動追加（物販・予約外）</span>
              <button onClick={addManual} className="ml-auto rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white active:bg-blue-700">
                ＋ 追加
              </button>
            </div>
            {dayManual.length === 0 ? (
              <p className="px-3 py-3 text-[12px] text-slate-400">物販や予約に無い売上は「＋追加」で入力できます。</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {dayManual.map((m) => (
                    <tr key={m.id}>
                      <td className="px-2 py-1.5">
                        <select
                          value={m.staff_id ?? ""}
                          onChange={(e) => { setManualLocal(m.id, { staff_id: e.target.value || null }); }}
                          onBlur={() => persistManual(m.id)}
                          className="rounded border border-slate-300 px-1 py-1 text-xs"
                        >
                          <option value="">物販/その他</option>
                          {staff.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-1 py-1.5">
                        <input value={m.patient_name ?? ""} placeholder="品目/名前"
                          onChange={(e) => setManualLocal(m.id, { patient_name: e.target.value })}
                          onBlur={() => persistManual(m.id)}
                          className="w-full rounded border border-slate-300 px-1 py-1 text-sm" />
                      </td>
                      <td className="px-1 py-1.5 text-right">
                        <input type="number" min={0} placeholder="0" value={m.selfpay || ""}
                          onChange={(e) => setManualLocal(m.id, { selfpay: parseInt(e.target.value || "0", 10) })}
                          onBlur={() => persistManual(m.id)}
                          className="w-20 rounded border border-slate-300 px-1 py-1 text-right text-sm tabnum" />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button onClick={() => deleteManual(m.id)} className="text-xs font-bold text-red-400">削除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-400">
        名前・担当はその日の予約から自動表示。各人の自費（保険外）を入力すると担当ごとに集計され、
        当月の達成率が出ます。保険側（合計額・負担額）はレセコンの日計を1日1回入力してください。
        物販や予約外の売上は「手動追加」から。目標は担当ごとに万円で保存されます。
      </p>
    </div>
  );
}
