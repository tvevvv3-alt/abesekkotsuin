"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { loadAllStaff } from "@/lib/data";
import { toDateStr } from "@/lib/booking";
import type { Staff } from "@/lib/types";

interface Rental {
  id: string;
  date: string; // 貸出日
  patient_name: string | null;
  item: string | null; // 内容
  fee: number; // レンタル料
  staff_id: string | null;
  due_date: string | null; // 返却予定
  returned_on: string | null; // 返却日（null=貸出中）
  sale_id: string | null; // 個別売上連携
}

const yen = (n: number) => "¥" + n.toLocaleString();

export default function RentalBoard() {
  const supabase = useMemo(() => createClient(), []);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [date, setDate] = useState(() => toDateStr(new Date()));
  const [loading, setLoading] = useState(true);
  const [unreturned, setUnreturned] = useState(0);

  const monthStart = useMemo(() => date.slice(0, 8) + "01", [date]);
  const monthEnd = useMemo(() => {
    const [y, m] = date.split("-").map(Number);
    return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  }, [date]);
  const monthLabel = useMemo(() => {
    const d = new Date(date + "T00:00:00");
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  }, [date]);

  useEffect(() => {
    (async () => {
      const st = await loadAllStaff(supabase);
      setStaff(st.filter((s) => (s as unknown as { admin_visible?: boolean }).admin_visible !== false));
    })();
  }, [supabase]);

  const reload = useCallback(async () => {
    setLoading(true);
    const [{ data }, { count }] = await Promise.all([
      supabase.from("rentals").select("id, date, patient_name, item, fee, staff_id, due_date, returned_on, sale_id").gte("date", monthStart).lt("date", monthEnd).order("date"),
      supabase.from("rentals").select("id", { count: "exact", head: true }).is("returned_on", null),
    ]);
    setRentals((data as Rental[]) ?? []);
    setUnreturned(count ?? 0);
    setLoading(false);
  }, [supabase, monthStart, monthEnd]);
  useEffect(() => { reload(); }, [reload]);

  const assignees = useMemo(() => staff.map((s) => ({ id: s.id, name: s.name, color: s.color || "#64748b" })), [staff]);
  const colorOf = (id: string | null) => assignees.find((a) => a.id === id)?.color ?? null;

  async function addRental() {
    const { data } = await supabase
      .from("rentals")
      .insert({ date, patient_name: "", item: "", fee: 0, staff_id: null, due_date: null, returned_on: null, sale_id: null })
      .select("id, date, patient_name, item, fee, staff_id, due_date, returned_on, sale_id")
      .single();
    if (data) setRentals((r) => [...r, data as Rental]);
  }
  function setLocal(id: string, patch: Partial<Rental>) {
    setRentals((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  // レンタル料を個別売上(sales)に反映：fee>0 なら連携行を作成/更新、0なら削除
  async function syncSale(r: Rental): Promise<string | null> {
    if (r.fee > 0) {
      if (r.sale_id) {
        await supabase.from("sales").update({ date: r.date, patient_name: r.patient_name, staff_id: r.staff_id, selfpay: r.fee }).eq("id", r.sale_id);
        return r.sale_id;
      }
      const { data } = await supabase.from("sales").insert({ date: r.date, patient_name: r.patient_name, staff_id: r.staff_id, selfpay: r.fee, insurance: 0, burden: 0, cost: 0, payment: "cash", product_id: null }).select("id").single();
      return (data as { id: string } | null)?.id ?? null;
    }
    if (r.sale_id) { await supabase.from("sales").delete().eq("id", r.sale_id); }
    return null;
  }
  async function persistRental(id: string) {
    const r = rentals.find((x) => x.id === id);
    if (!r) return;
    const saleId = await syncSale(r);
    if (saleId !== r.sale_id) setLocal(id, { sale_id: saleId });
    await supabase.from("rentals").update({
      date: r.date, patient_name: r.patient_name, item: r.item, fee: r.fee, staff_id: r.staff_id,
      due_date: r.due_date, returned_on: r.returned_on, sale_id: saleId,
    }).eq("id", id);
    if (r.returned_on === null) reloadCount();
  }
  async function reloadCount() {
    const { count } = await supabase.from("rentals").select("id", { count: "exact", head: true }).is("returned_on", null);
    setUnreturned(count ?? 0);
  }
  async function toggleReturned(r: Rental) {
    const next = r.returned_on ? null : toDateStr(new Date());
    setLocal(r.id, { returned_on: next });
    await supabase.from("rentals").update({ returned_on: next }).eq("id", r.id);
    reloadCount();
  }
  async function deleteRental(r: Rental) {
    if (!confirm("このレンタル記録を削除しますか？")) return;
    setRentals((rs) => rs.filter((x) => x.id !== r.id));
    if (r.sale_id) await supabase.from("sales").delete().eq("id", r.sale_id);
    await supabase.from("rentals").delete().eq("id", r.id);
    reloadCount();
  }

  const totalFee = useMemo(() => rentals.reduce((x, r) => x + r.fee, 0), [rentals]);
  const gotoMonth = (dir: number) => {
    const [y, m] = date.split("-").map(Number);
    const nm = m + dir;
    const ny = nm < 1 ? y - 1 : nm > 12 ? y + 1 : y;
    const mm = ((nm - 1 + 12) % 12) + 1;
    setDate(`${ny}-${String(mm).padStart(2, "0")}-01`);
  };
  const md = (s: string | null) => (s ? `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}` : "");
  const btn = "flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 active:bg-slate-100";
  const dateInput = "rounded border border-slate-300 px-1 py-1 text-[12px]";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="/admin/sales" className="flex shrink-0 items-center gap-1 rounded-md bg-slate-600 px-2 py-1 text-[11px] font-bold text-white active:bg-slate-700">← 個別売上</Link>
        <h1 className="text-lg font-bold text-slate-800">レンタル</h1>
        {unreturned > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-600">未返却 {unreturned}件</span>}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => gotoMonth(-1)} className={btn}>‹</button>
          <span className="min-w-[86px] text-center text-sm font-bold text-slate-700">{monthLabel}</span>
          <button onClick={() => gotoMonth(1)} className={btn}>›</button>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm text-slate-500">{monthLabel} レンタル料 <b className="tabnum text-slate-700">{yen(totalFee)}</b></span>
        <button onClick={addRental} className="ml-auto rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white active:bg-blue-700">＋ レンタルを追加</button>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-[11px] text-slate-500">
            <tr>
              <th className="px-1 py-2 text-left font-bold">貸出日</th>
              <th className="px-2 py-2 text-left font-bold">名前</th>
              <th className="px-1 py-2 text-left font-bold">内容</th>
              <th className="px-1 py-2 text-right font-bold">レンタル料</th>
              <th className="px-1 py-2 text-left font-bold">返却予定</th>
              <th className="px-1 py-2 text-center font-bold">状態</th>
              <th className="px-1 py-2 text-left font-bold">担当</th>
              <th className="px-1 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={8} className="px-2 py-8 text-center text-sm text-slate-400">読み込み中…</td></tr>
            ) : rentals.length === 0 ? (
              <tr><td colSpan={8} className="px-2 py-8 text-center text-sm text-slate-400">この月のレンタルはありません。「＋レンタルを追加」から入力してください。</td></tr>
            ) : (
              rentals.map((r) => {
                const c = colorOf(r.staff_id);
                const out = !r.returned_on;
                return (
                  <tr key={r.id} className={out ? "bg-rose-50/40" : ""}>
                    <td className="px-1 py-1">
                      <input type="date" value={r.date} onChange={(e) => e.target.value && setLocal(r.id, { date: e.target.value })} onBlur={() => persistRental(r.id)} className={dateInput} />
                    </td>
                    <td className="px-2 py-1">
                      <input value={r.patient_name ?? ""} placeholder="名前" onChange={(e) => setLocal(r.id, { patient_name: e.target.value })} onBlur={() => persistRental(r.id)} className="w-24 rounded border border-slate-300 px-1 py-1 text-sm" />
                    </td>
                    <td className="px-1 py-1">
                      <input value={r.item ?? ""} placeholder="内容" onChange={(e) => setLocal(r.id, { item: e.target.value })} onBlur={() => persistRental(r.id)} className="w-28 rounded border border-slate-300 px-1 py-1 text-sm" />
                    </td>
                    <td className="px-1 py-1 text-right">
                      <input type="number" min={0} value={r.fee || ""} placeholder="0" onChange={(e) => setLocal(r.id, { fee: parseInt(e.target.value || "0", 10) })} onBlur={() => persistRental(r.id)} className="w-[80px] rounded border border-slate-300 px-1 py-1 text-right text-sm tabnum focus:outline-none" />
                    </td>
                    <td className="px-1 py-1">
                      <input type="date" value={r.due_date ?? ""} onChange={(e) => setLocal(r.id, { due_date: e.target.value || null })} onBlur={() => persistRental(r.id)} className={dateInput} />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <button onClick={() => toggleReturned(r)}
                        className={`whitespace-nowrap rounded-md border px-2 py-1 text-[11px] font-bold ${out ? "border-rose-300 bg-rose-50 text-rose-600" : "border-emerald-300 bg-emerald-50 text-emerald-600"}`}>
                        {out ? "貸出中" : `返却 ${md(r.returned_on)}`}
                      </button>
                    </td>
                    <td className="px-1 py-1">
                      <select value={r.staff_id ?? ""} onChange={(e) => setLocal(r.id, { staff_id: e.target.value || null })} onBlur={() => persistRental(r.id)}
                        className="rounded border px-1 py-1 text-[11px] font-bold" style={c ? { backgroundColor: c, color: "#fff", borderColor: c } : { backgroundColor: "#f1f5f9", color: "#64748b", borderColor: "#e2e8f0" }}>
                        <option value="" style={{ color: "#0f172a", background: "#fff" }}>-</option>
                        {assignees.map((a) => <option key={a.id} value={a.id} style={{ color: "#0f172a", background: "#fff" }}>{a.name}</option>)}
                      </select>
                    </td>
                    <td className="px-1 py-1 text-center">
                      <button onClick={() => deleteRental(r)} className="text-[11px] font-bold text-red-400">削除</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-400">
        「貸出中／返却」ボタンで返却を記録します（未返却は上部に件数表示・行を薄い赤で表示）。レンタル料は個別売上（担当ごとの集計・年間一覧）に反映されます。
      </p>
    </div>
  );
}
