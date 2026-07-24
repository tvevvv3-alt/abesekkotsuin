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
  selfpay: number; // 保険外（自費）
  insurance: number; // 合計額（保険総額）
  burden: number; // 負担額（窓口負担）
  anchor_appointment_id?: string | null; // 物販をこの予約(購入者)の下に置く
  sort_order?: number | null; // 手動並び替え用
}
const zeroSale = (): Omit<Sale, "id" | "appointment_id" | "date" | "staff_id" | "patient_name"> => ({
  selfpay: 0,
  insurance: 0,
  burden: 0,
});

export default function SalesBoard() {
  const supabase = useMemo(() => createClient(), []);
  const [view, setView] = useState<"day" | "month">("day");
  const [date, setDate] = useState(() => toDateStr(new Date()));
  const [staff, setStaff] = useState<Staff[]>([]);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const salesRef = useRef(sales);
  salesRef.current = sales;
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragDy, setDragDy] = useState(0);
  const dragStartY = useRef(0);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

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
        .order("date")
        .order("start_min"),
      supabase
        .from("sales")
        .select("id, appointment_id, date, staff_id, patient_name, selfpay, insurance, burden, anchor_appointment_id, sort_order")
        .gte("date", monthStart)
        .lt("date", monthEnd),
    ]);
    setAppts((ap as Appt[]) ?? []);
    setSales((sl as Sale[]) ?? []);
    setLoading(false);
  }, [supabase, monthStart, monthEnd]);

  useEffect(() => {
    reload();
  }, [reload]);

  const saleByAppt = useMemo(() => {
    const m: Record<string, Sale> = {};
    sales.forEach((s) => {
      if (s.appointment_id) m[s.appointment_id] = s;
    });
    return m;
  }, [sales]);
  const manualSales = useMemo(() => sales.filter((s) => !s.appointment_id), [sales]);

  // --- 予約行の編集（担当・自費・合計額・負担額） ---
  function apptVal(a: Appt): Sale {
    return (
      saleByAppt[a.id] ?? {
        id: "tmp-" + a.id,
        appointment_id: a.id,
        date: a.date,
        staff_id: a.staff_id,
        patient_name: a.patient_name,
        ...zeroSale(),
      }
    );
  }
  function setApptField(a: Appt, field: "selfpay" | "insurance" | "burden" | "staff_id", val: number | string | null) {
    setSales((prev) => {
      const idx = prev.findIndex((s) => s.appointment_id === a.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], [field]: val };
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
          ...zeroSale(),
          [field]: val,
        } as Sale,
      ];
    });
  }
  async function persistAppt(a: Appt) {
    const s = salesRef.current.find((x) => x.appointment_id === a.id) ?? apptVal(a);
    await supabase.from("sales").upsert(
      {
        appointment_id: a.id,
        date: a.date,
        staff_id: s.staff_id ?? a.staff_id,
        patient_name: a.patient_name,
        selfpay: s.selfpay,
        insurance: s.insurance,
        burden: s.burden,
      },
      { onConflict: "appointment_id" }
    );
    reload();
  }

  // --- 手動行（物販・予約外） ---
  async function addManual(anchor?: string) {
    const { data } = await supabase
      .from("sales")
      .insert({ date, staff_id: null, patient_name: "", selfpay: 0, insurance: 0, burden: 0, anchor_appointment_id: anchor ?? null })
      .select("id, appointment_id, date, staff_id, patient_name, selfpay, insurance, burden, anchor_appointment_id")
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
      .update({ staff_id: s.staff_id, patient_name: s.patient_name, selfpay: s.selfpay, insurance: s.insurance, burden: s.burden })
      .eq("id", id);
  }
  async function deleteManual(id: string) {
    setSales((prev) => prev.filter((s) => s.id !== id));
    await supabase.from("sales").delete().eq("id", id);
  }
  async function saveTarget(staffId: string, man: number) {
    const yenv = Math.max(0, Math.round(man * 10000));
    setTargets((t) => ({ ...t, [staffId]: yenv }));
    await supabase.from("staff").update({ sales_target: yenv }).eq("id", staffId);
  }

  // --- 集計 ---
  const total = (s: { selfpay: number; insurance: number }) => s.selfpay + s.insurance; // 合計
  const paid = (s: { selfpay: number; burden: number }) => s.selfpay + s.burden; // 入金額
  const staffTotal = useCallback(
    (staffId: string | null) =>
      sales.reduce((sum, s) => (s.staff_id === staffId ? sum + total(s) : sum), 0),
    [sales]
  );
  // 担当ごとの自費（保険外）月計
  const spByStaff = useCallback(
    (staffId: string | null) =>
      sales.reduce((sum, s) => (s.staff_id === staffId ? sum + s.selfpay : sum), 0),
    [sales]
  );

  const yen = (n: number) => "¥" + n.toLocaleString();
  const d = new Date(date + "T00:00:00");
  const monthLabel = `${d.getFullYear()}年${d.getMonth() + 1}月`;

  // 当日の行（予約＋手動）
  const dayRows = useMemo(() => {
    const aps = appts.filter((a) => a.date === date);
    return aps;
  }, [appts, date]);
  const dayManual = useMemo(() => manualSales.filter((s) => s.date === date), [manualSales, date]);
  // 並び順（sort_orderで手動入れ替え可。既定は予約=時刻順、物販=末尾）
  const dayItems = useMemo(() => {
    const items = [
      ...dayRows.map((a, i) => ({ kind: "appt" as const, a, ord: saleByAppt[a.id]?.sort_order ?? a.start_min * 1000 + i })),
      ...dayManual.map((m, i) => ({ kind: "manual" as const, m, ord: m.sort_order ?? 9_000_000 + i })),
    ];
    items.sort((x, y) => x.ord - y.ord);
    return items;
  }, [dayRows, dayManual, saleByAppt]);

  async function setItemOrder(it: { kind: "appt"; a: Appt } | { kind: "manual"; m: Sale }, ord: number) {
    if (it.kind === "manual") {
      setSales((prev) => prev.map((s) => (s.id === it.m.id ? { ...s, sort_order: ord } : s)));
      await supabase.from("sales").update({ sort_order: ord }).eq("id", it.m.id);
    } else {
      const a = it.a;
      const cur = salesRef.current.find((s) => s.appointment_id === a.id);
      await supabase.from("sales").upsert(
        {
          appointment_id: a.id, date: a.date, staff_id: cur?.staff_id ?? a.staff_id, patient_name: a.patient_name,
          selfpay: cur?.selfpay ?? 0, insurance: cur?.insurance ?? 0, burden: cur?.burden ?? 0, sort_order: ord,
        },
        { onConflict: "appointment_id" }
      );
    }
  }
  const itemId = (it: { kind: "appt"; a: Appt } | { kind: "manual"; m: Sale }) => (it.kind === "appt" ? it.a.id : it.m.id);
  // ドラッグ＆ドロップ並び替え（マウス・タッチ両対応）
  function onDragStart(e: React.PointerEvent, id: string) {
    setDragId(id);
    setDragDy(0);
    dragStartY.current = e.clientY;
    setDrop({ id, after: false });
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
  }
  function onDragMove(e: React.PointerEvent) {
    if (!dragId) return;
    setDragDy(e.clientY - dragStartY.current);
    const y = e.clientY;
    let best: { id: string; after: boolean } | null = null;
    for (const it of dayItems) {
      const id = itemId(it);
      const el = rowRefs.current[id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (y < r.top) { best = { id, after: false }; break; }
      if (y <= r.bottom) { best = { id, after: y > r.top + r.height / 2 }; break; }
      best = { id, after: true };
    }
    if (best && (best.id !== drop?.id || best.after !== drop?.after)) setDrop(best);
  }
  async function onDragEnd() {
    const cur = dragId;
    const dr = drop;
    setDragId(null);
    setDragDy(0);
    setDrop(null);
    if (!cur) return;
    const ids = dayItems.map(itemId).filter((x) => x !== cur);
    if (dr && dr.id !== cur) {
      let idx = ids.indexOf(dr.id);
      if (idx < 0) idx = ids.length;
      else if (dr.after) idx += 1;
      ids.splice(idx, 0, cur);
    } else {
      ids.splice(dayItems.map(itemId).indexOf(cur), 0, cur);
    }
    const byId: Record<string, { kind: "appt"; a: Appt } | { kind: "manual"; m: Sale }> = {};
    dayItems.forEach((it) => { byId[itemId(it)] = it; });
    await Promise.all(ids.map((id, i) => (byId[id] ? setItemOrder(byId[id], i * 10) : Promise.resolve())));
    reload();
  }
  const grip = (id: string) => (
    <span
      onPointerDown={(e) => onDragStart(e, id)}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
      className={`inline-flex cursor-grab touch-none select-none rounded-md border px-1.5 py-1 text-lg leading-none active:cursor-grabbing ${
        dragId === id ? "border-blue-400 bg-blue-50 text-blue-500" : "border-slate-200 text-slate-400 active:bg-slate-100"
      }`}
      title="ドラッグで並び替え"
    >
      ⠿
    </span>
  );
  // ドラッグ中の行は「浮き上がって」指に追従、落とし先には青いライン
  const rowStyle = (id: string): React.CSSProperties =>
    dragId === id
      ? {
          transform: `translateY(${dragDy}px)`,
          position: "relative",
          zIndex: 30,
          background: "#fff",
          boxShadow: "0 12px 28px rgba(0,0,0,.20), inset 0 0 0 2px #60a5fa",
        }
      : {};
  const rowClass = (id: string, base = "") =>
    `${base} ${dragId ? "transition-none" : ""} ${
      dragId && dragId !== id && drop?.id === id
        ? drop.after
          ? "shadow-[inset_0_-3px_0_0_#3b82f6]"
          : "shadow-[inset_0_3px_0_0_#3b82f6]"
        : ""
    }`;

  // 当日の合計
  const daySum = useMemo(() => {
    let sp = 0, ins = 0, bur = 0, cnt = 0;
    dayRows.forEach((a) => {
      const s = saleByAppt[a.id];
      if (s) { sp += s.selfpay; ins += s.insurance; bur += s.burden; }
      cnt++;
    });
    dayManual.forEach((s) => { sp += s.selfpay; ins += s.insurance; bur += s.burden; cnt++; });
    return { sp, ins, bur, cnt, paid: sp + bur, gou: sp + ins };
  }, [dayRows, dayManual, saleByAppt]);

  // 保険外の担当バケット（1=阿部/2=澁谷/3=萩原・林/4=物販・その他）
  const bucket = useMemo(() => {
    const find = (...kw: string[]) => staff.find((s) => kw.some((k) => s.name.includes(k)))?.id ?? null;
    return { abe: find("阿部"), shibu: find("澁谷", "渋谷"), hagi: find("萩原"), haya: find("林") };
  }, [staff]);

  type DayAgg = { cnt: number; shin: number; ins: number; bur: number; ho1: number; ho2: number; ho3: number; ho4: number };
  // 日計表（月）：レセコンと同じ並び（件数・新患・合計額・負担額・入金額・保険外1〜4）
  const monthDaily = useMemo(() => {
    const map = new Map<string, DayAgg>();
    const get = (dt: string) => {
      let e = map.get(dt);
      if (!e) { e = { cnt: 0, shin: 0, ins: 0, bur: 0, ho1: 0, ho2: 0, ho3: 0, ho4: 0 }; map.set(dt, e); }
      return e;
    };
    // 件数・新患（予約ベース／新患は当月内で初めて出た氏名を目安に）
    const seen = new Set<string>();
    [...appts]
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_min - b.start_min)
      .forEach((a) => {
        const e = get(a.date);
        e.cnt++;
        const nm = (a.patient_name || "").trim();
        if (nm && !seen.has(nm)) { seen.add(nm); e.shin++; }
      });
    // 金額（salesベース）：合計額=保険総額 / 負担額 / 保険外は担当で1〜4に振り分け
    sales.forEach((s) => {
      const e = get(s.date);
      e.ins += s.insurance;
      e.bur += s.burden;
      if (s.staff_id && s.staff_id === bucket.abe) e.ho1 += s.selfpay;
      else if (s.staff_id && s.staff_id === bucket.shibu) e.ho2 += s.selfpay;
      else if (s.staff_id && (s.staff_id === bucket.hagi || s.staff_id === bucket.haya)) e.ho3 += s.selfpay;
      else e.ho4 += s.selfpay;
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [appts, sales, bucket]);
  const monthSum = useMemo(
    () =>
      monthDaily.reduce(
        (acc, [, e]) => ({
          cnt: acc.cnt + e.cnt, shin: acc.shin + e.shin, ins: acc.ins + e.ins, bur: acc.bur + e.bur,
          ho1: acc.ho1 + e.ho1, ho2: acc.ho2 + e.ho2, ho3: acc.ho3 + e.ho3, ho4: acc.ho4 + e.ho4,
        }),
        { cnt: 0, shin: 0, ins: 0, bur: 0, ho1: 0, ho2: 0, ho3: 0, ho4: 0 }
      ),
    [monthDaily]
  );
  const monthSp = monthSum.ho1 + monthSum.ho2 + monthSum.ho3 + monthSum.ho4;

  const btn = "flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 active:bg-slate-100";
  const amt = "w-[68px] rounded border border-slate-300 px-1 py-1 text-right text-sm tabnum focus:border-blue-400 focus:outline-none";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800">個別売上</h1>
        <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
          {([["day", "日別入力"], ["month", "日計表(月)"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setView(v)}
              className={`rounded px-2 py-1 text-[11px] font-bold ${view === v ? "bg-blue-600 text-white" : "text-slate-600"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setDate(toDateStr(addDays(d, view === "month" ? -31 : -1)))} className={btn}>‹</button>
          <button onClick={() => setDate(toDateStr(new Date()))} className="rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white active:bg-blue-700">今日</button>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-md border border-slate-300 px-1 py-1 text-[12px] text-slate-600" />
          <button onClick={() => setDate(toDateStr(addDays(d, view === "month" ? 31 : 1)))} className={btn}>›</button>
        </div>
      </div>

      {/* 当月サマリー（担当ごとの総売上＝自費＋保険 vs 目標） */}
      <div className="mb-4 rounded-xl border bg-white p-3">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 text-sm">
          <span className="font-bold text-slate-700">{monthLabel} 当月</span>
          <span className="text-slate-500">保険 <b className="tabnum text-slate-700">{yen(monthSum.ins)}</b></span>
          <span className="text-slate-500">自費 <b className="tabnum text-slate-700">{yen(monthSp)}</b></span>
          <span className="ml-auto font-bold text-slate-800">総売上 {yen(monthSp + monthSum.ins)}</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {staff.map((s) => {
            const tot = staffTotal(s.id);
            const target = targets[s.id] ?? 0;
            const pct = target > 0 ? Math.round((tot / target) * 1000) / 10 : 0;
            return (
              <div key={s.id} className="rounded-lg border p-2">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color || "#64748b" }} />
                  <span className="text-sm font-bold text-slate-800">{s.name}</span>
                  <span className="ml-auto flex items-center gap-1 text-[11px] text-slate-400">
                    目標
                    <input type="number" min={0} value={target ? target / 10000 : ""} placeholder="0"
                      onChange={(e) => saveTarget(s.id, parseFloat(e.target.value || "0"))}
                      className="w-14 rounded border border-slate-300 px-1 py-0.5 text-right text-[11px]" />万
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-base font-bold tabnum text-slate-800">{yen(tot)}</span>
                  {target > 0 && <span className={`text-xs font-bold ${pct >= 100 ? "text-emerald-600" : pct >= 70 ? "text-blue-600" : "text-slate-500"}`}>{pct}%</span>}
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
            <div className="mt-1 text-base font-bold tabnum text-slate-800">{yen(staffTotal(null))}</div>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">読み込み中…</p>
      ) : view === "month" ? (
        /* ===== 日計表（月）: レセコンと同じ並び ===== */
        <div>
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-slate-50 text-[11px] text-slate-500">
              <tr>
                <th className="px-2 py-2 text-left font-bold">日付</th>
                <th className="px-2 py-2 text-right font-bold">件数</th>
                <th className="px-2 py-2 text-right font-bold">新患</th>
                <th className="px-2 py-2 text-right font-bold">合計額</th>
                <th className="px-2 py-2 text-right font-bold">負担額</th>
                <th className="px-2 py-2 text-right font-bold">入金額</th>
                <th className="px-2 py-2 text-right font-bold">保険外1<span className="font-normal">(阿部)</span></th>
                <th className="px-2 py-2 text-right font-bold">保険外2<span className="font-normal">(澁谷)</span></th>
                <th className="px-2 py-2 text-right font-bold">保険外3<span className="font-normal">(萩原林)</span></th>
                <th className="px-2 py-2 text-right font-bold">保険外4<span className="font-normal">(物販)</span></th>
              </tr>
            </thead>
            <tbody className="divide-y tabnum">
              {monthDaily.map(([dt, e]) => {
                const dd = new Date(dt + "T00:00:00");
                return (
                  <tr key={dt} className="cursor-pointer hover:bg-blue-50" onClick={() => { setDate(dt); setView("day"); }}>
                    <td className="px-2 py-1.5 text-left">{dd.getMonth() + 1}/{dd.getDate()}（{WEEKDAY_LABELS[dd.getDay()]}）</td>
                    <td className="px-2 py-1.5 text-right">{e.cnt}</td>
                    <td className="px-2 py-1.5 text-right">{e.shin}</td>
                    <td className="px-2 py-1.5 text-right">{e.ins.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right">{e.bur.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right">{e.bur.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right">{e.ho1.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right">{e.ho2.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right">{e.ho3.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right">{e.ho4.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-amber-50 font-bold tabnum">
                <td className="px-2 py-2 text-left">月計</td>
                <td className="px-2 py-2 text-right">{monthSum.cnt}</td>
                <td className="px-2 py-2 text-right">{monthSum.shin}</td>
                <td className="px-2 py-2 text-right">{monthSum.ins.toLocaleString()}</td>
                <td className="px-2 py-2 text-right">{monthSum.bur.toLocaleString()}</td>
                <td className="px-2 py-2 text-right">{monthSum.bur.toLocaleString()}</td>
                <td className="px-2 py-2 text-right">{monthSum.ho1.toLocaleString()}</td>
                <td className="px-2 py-2 text-right">{monthSum.ho2.toLocaleString()}</td>
                <td className="px-2 py-2 text-right">{monthSum.ho3.toLocaleString()}</td>
                <td className="px-2 py-2 text-right">{monthSum.ho4.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {/* 保険外3（萩原・林）の内訳（月計） */}
        {(bucket.hagi || bucket.haya) && (() => {
          const hg = spByStaff(bucket.hagi);
          const hy = spByStaff(bucket.haya);
          const hgName = staff.find((s) => s.id === bucket.hagi)?.name ?? "萩原";
          const hyName = staff.find((s) => s.id === bucket.haya)?.name ?? "林";
          return (
            <div className="mt-2 inline-flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border bg-white px-4 py-2 text-sm">
              <span className="font-bold text-slate-700">保険外3（{hgName}・{hyName}）内訳</span>
              <span className="text-slate-500">{hgName} <b className="tabnum text-slate-800">{yen(hg)}</b></span>
              <span className="text-slate-500">{hyName} <b className="tabnum text-slate-800">{yen(hy)}</b></span>
              <span className="font-bold text-blue-700">計 <span className="tabnum">{yen(hg + hy)}</span></span>
            </div>
          );
        })()}
        </div>
      ) : (
        /* ===== 日別入力 ===== */
        <div>
          <div className="mb-1 flex items-center">
            <span className="text-sm font-bold text-slate-700">{d.getMonth() + 1}/{d.getDate()}（{WEEKDAY_LABELS[d.getDay()]}）</span>
            <button onClick={() => addManual()} className="ml-auto rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white active:bg-blue-700">＋ 物販/予約外</button>
          </div>
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] text-slate-500">
                <tr>
                  <th className="px-1 py-2 text-left font-bold">担当</th>
                  <th className="px-2 py-2 text-left font-bold">名前</th>
                  <th className="px-1 py-2 text-right font-bold">保険外</th>
                  <th className="px-1 py-2 text-right font-bold">合計額</th>
                  <th className="px-1 py-2 text-right font-bold">負担額</th>
                  <th className="px-1 py-2 text-right font-bold">入金額</th>
                  <th className="px-2 py-2 text-right font-bold">合計</th>
                  <th className="px-1 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {dayItems.map((it) =>
                  it.kind === "appt" ? (
                    (() => {
                      const a = it.a;
                      const s = apptVal(a);
                      return (
                        <tr key={a.id} ref={(el) => { rowRefs.current[a.id] = el; }}
                          className={rowClass(a.id)} style={rowStyle(a.id)}>
                          <td className="px-1 py-1">
                            <select value={s.staff_id ?? ""} onChange={(e) => setApptField(a, "staff_id", e.target.value || null)} onBlur={() => persistAppt(a)}
                              className="rounded border border-slate-200 px-0.5 py-1 text-[11px]">
                              <option value="">-</option>
                              {staff.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                            </select>
                          </td>
                          <td className="whitespace-nowrap px-2 py-1">
                            <span className="font-medium text-slate-800">{a.patient_name || "（未登録）"}</span>
                            <span className="ml-1 text-[10px] text-slate-400">{minToLabel(a.start_min)}</span>
                          </td>
                          <td className="px-1 py-1 text-right">
                            <input type="number" min={0} placeholder="0" value={s.selfpay || ""}
                              onChange={(e) => setApptField(a, "selfpay", parseInt(e.target.value || "0", 10))} onBlur={() => persistAppt(a)} className={amt} />
                          </td>
                          <td className="px-1 py-1 text-right">
                            <input type="number" min={0} placeholder="0" value={s.insurance || ""}
                              onChange={(e) => setApptField(a, "insurance", parseInt(e.target.value || "0", 10))} onBlur={() => persistAppt(a)} className={amt} />
                          </td>
                          <td className="px-1 py-1 text-right">
                            <input type="number" min={0} placeholder="0" value={s.burden || ""}
                              onChange={(e) => setApptField(a, "burden", parseInt(e.target.value || "0", 10))} onBlur={() => persistAppt(a)} className={amt} />
                          </td>
                          <td className="px-1 py-1 text-right tabnum text-slate-500">{paid(s).toLocaleString()}</td>
                          <td className="px-2 py-1 text-right font-bold tabnum text-slate-800">{total(s).toLocaleString()}</td>
                          <td className="px-1 py-1 text-center">{grip(a.id)}</td>
                        </tr>
                      );
                    })()
                  ) : (
                    (() => {
                      const m = it.m;
                      return (
                        <tr key={m.id} ref={(el) => { rowRefs.current[m.id] = el; }}
                          className={rowClass(m.id, "bg-amber-50/40")} style={rowStyle(m.id)}>
                          <td className="px-1 py-1">
                            <select value={m.staff_id ?? ""} onChange={(e) => setManualLocal(m.id, { staff_id: e.target.value || null })} onBlur={() => persistManual(m.id)}
                              className="rounded border border-slate-200 px-0.5 py-1 text-[11px]">
                              <option value="">物販</option>
                              {staff.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-1">
                            <input value={m.patient_name ?? ""} placeholder="品目/名前" onChange={(e) => setManualLocal(m.id, { patient_name: e.target.value })} onBlur={() => persistManual(m.id)}
                              className="w-24 rounded border border-slate-300 px-1 py-1 text-sm" />
                          </td>
                          <td className="px-1 py-1 text-right">
                            <input type="number" min={0} placeholder="0" value={m.selfpay || ""} onChange={(e) => setManualLocal(m.id, { selfpay: parseInt(e.target.value || "0", 10) })} onBlur={() => persistManual(m.id)} className={amt} />
                          </td>
                          <td className="px-1 py-1 text-right">
                            <input type="number" min={0} placeholder="0" value={m.insurance || ""} onChange={(e) => setManualLocal(m.id, { insurance: parseInt(e.target.value || "0", 10) })} onBlur={() => persistManual(m.id)} className={amt} />
                          </td>
                          <td className="px-1 py-1 text-right">
                            <input type="number" min={0} placeholder="0" value={m.burden || ""} onChange={(e) => setManualLocal(m.id, { burden: parseInt(e.target.value || "0", 10) })} onBlur={() => persistManual(m.id)} className={amt} />
                          </td>
                          <td className="px-1 py-1 text-right tabnum text-slate-500">{paid(m).toLocaleString()}</td>
                          <td className="px-2 py-1 text-right font-bold tabnum text-slate-800">{total(m).toLocaleString()}</td>
                          <td className="whitespace-nowrap px-1 py-1 text-center">
                            {grip(m.id)}
                            <button onClick={() => deleteManual(m.id)} className="ml-1 text-[11px] font-bold text-red-400">削除</button>
                          </td>
                        </tr>
                      );
                    })()
                  )
                )}
                {dayItems.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-400">この日の予約はありません（物販/予約外は右上の＋から）。</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-amber-50 font-bold tabnum">
                  <td className="px-2 py-2 text-left" colSpan={2}>計 {daySum.cnt}件</td>
                  <td className="px-1 py-2 text-right">{daySum.sp.toLocaleString()}</td>
                  <td className="px-1 py-2 text-right">{daySum.ins.toLocaleString()}</td>
                  <td className="px-1 py-2 text-right">{daySum.bur.toLocaleString()}</td>
                  <td className="px-1 py-2 text-right">{daySum.paid.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right">{daySum.gou.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-400">
        名前・担当は予約から自動。各人に 保険外(自費)・合計額(保険総額)・負担額 を入力すると、
        入金額(=自費+負担額)・合計(=自費+合計額) と日計・月計が自動集計されます。物販や予約外は
        「＋物販/予約外」から。担当ごとの合計(自費+保険)で当月の達成率が出ます。
      </p>
    </div>
  );
}
