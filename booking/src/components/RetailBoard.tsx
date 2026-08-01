"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { loadAllStaff } from "@/lib/data";
import { toDateStr } from "@/lib/booking";
import type { Staff } from "@/lib/types";

interface Product {
  id: string;
  name: string;
  cost: number; // 仕入れ（単価）
  price: number; // 販売価格（単価・既定）
  sort_order: number;
  active: boolean;
}
interface RSale {
  id: string;
  date: string;
  patient_name: string | null;
  product_id: string | null;
  qty: number;
  selfpay: number; // 販売合計（単価×数量）
  cost: number; // 仕入合計（単価×数量）
  staff_id: string | null;
}

const yen = (n: number) => "¥" + n.toLocaleString();

export default function RetailBoard() {
  const supabase = useMemo(() => createClient(), []);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<RSale[]>([]);
  const [date, setDate] = useState(() => toDateStr(new Date()));
  const [loading, setLoading] = useState(true);
  const [masterOpen, setMasterOpen] = useState(false);

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
      const { data: pr } = await supabase.from("products").select("id, name, cost, price, sort_order, active").order("sort_order");
      setProducts((pr as Product[]) ?? []);
    })();
  }, [supabase]);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("sales")
      .select("id, date, patient_name, product_id, qty, selfpay, cost, staff_id")
      .or("product_id.not.is.null,retail.is.true")
      .gte("date", monthStart)
      .lt("date", monthEnd)
      .order("date");
    setSales((data as RSale[]) ?? []);
    setLoading(false);
  }, [supabase, monthStart, monthEnd]);
  useEffect(() => { reload(); }, [reload]);

  // ---- 商品マスタ ----
  async function addProduct() {
    const { data, error } = await supabase.from("products").insert({ name: "", cost: 0, price: 0, sort_order: products.length }).select("id, name, cost, price, sort_order, active").single();
    if (error) { alert("商品を追加できませんでした：\n" + error.message + "\n（migration_retail_rental.sql を実行済みかご確認ください）"); return; }
    if (data) setProducts((p) => [...p, data as Product]);
  }
  function setProductLocal(id: string, patch: Partial<Product>) {
    setProducts((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  async function persistProduct(id: string) {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    await supabase.from("products").update({ name: p.name, cost: p.cost, price: p.price, active: p.active }).eq("id", id);
  }
  async function deleteProduct(id: string) {
    if (!confirm("この商品をマスタから削除しますか？（過去の物販売上は残ります）")) return;
    setProducts((p) => p.filter((x) => x.id !== id));
    await supabase.from("products").delete().eq("id", id);
  }

  // ---- 物販売上 ----
  async function addSale() {
    const { data, error } = await supabase
      .from("sales")
      .insert({ date, product_id: null, qty: 1, selfpay: 0, cost: 0, staff_id: null, patient_name: "", insurance: 0, burden: 0, payment: "cash", retail: true })
      .select("id, date, patient_name, product_id, qty, selfpay, cost, staff_id")
      .single();
    if (error) { alert("物販を追加できませんでした：\n" + error.message + "\n（sales に product_id/qty/cost 列があるかご確認ください）"); return; }
    if (data) setSales((s) => [...s, data as RSale]);
  }
  function setSaleLocal(id: string, patch: Partial<RSale>) {
    setSales((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  async function persistSale(id: string) {
    const s = sales.find((x) => x.id === id);
    if (!s) return;
    await supabase.from("sales").update({ date: s.date, patient_name: s.patient_name, product_id: s.product_id, qty: s.qty, selfpay: s.selfpay, cost: s.cost, staff_id: s.staff_id }).eq("id", id);
  }
  async function deleteSale(id: string) {
    setSales((s) => s.filter((x) => x.id !== id));
    await supabase.from("sales").delete().eq("id", id);
  }

  // 単価（販売/仕入）は合計/数量から算出。数量・単価・商品変更で合計を再計算。
  const unit = (total: number, qty: number) => (qty > 0 ? Math.round(total / qty) : total);
  function pickProduct(row: RSale, pid: string) {
    const p = products.find((x) => x.id === pid);
    const q = row.qty || 1;
    setSaleLocal(row.id, { product_id: pid || null, selfpay: (p?.price ?? 0) * q, cost: (p?.cost ?? 0) * q });
  }
  function setUnitPrice(row: RSale, v: number) {
    setSaleLocal(row.id, { selfpay: v * (row.qty || 1) });
  }
  function setUnitCost(row: RSale, v: number) {
    setSaleLocal(row.id, { cost: v * (row.qty || 1) });
  }
  function setQty(row: RSale, q: number) {
    const up = unit(row.selfpay, row.qty || 1);
    const uc = unit(row.cost, row.qty || 1);
    setSaleLocal(row.id, { qty: q, selfpay: up * q, cost: uc * q });
  }

  const profit = (s: RSale) => s.selfpay - s.cost;
  const assignees = useMemo(() => staff.map((s) => ({ id: s.id, name: s.name, color: s.color || "#64748b" })), [staff]);
  const colorOf = (id: string | null) => assignees.find((a) => a.id === id)?.color ?? null;

  // 担当別の利益集計（未割当含む）
  const byStaff = useMemo(() => {
    const m = new Map<string, number>();
    sales.forEach((s) => { const k = s.staff_id ?? "__none"; m.set(k, (m.get(k) ?? 0) + profit(s)); });
    return m;
  }, [sales]);
  const totalProfit = useMemo(() => sales.reduce((x, s) => x + profit(s), 0), [sales]);
  const totalSales = useMemo(() => sales.reduce((x, s) => x + s.selfpay, 0), [sales]);

  const gotoMonth = (dir: number) => {
    const [y, m] = date.split("-").map(Number);
    const nm = m + dir;
    const ny = nm < 1 ? y - 1 : nm > 12 ? y + 1 : y;
    const mm = ((nm - 1 + 12) % 12) + 1;
    setDate(`${ny}-${String(mm).padStart(2, "0")}-01`);
  };
  const amt = "w-[74px] rounded border border-slate-300 px-1 py-1 text-right text-sm tabnum focus:border-blue-400 focus:outline-none";
  const btn = "flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 active:bg-slate-100";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="/admin/sales" className="flex shrink-0 items-center gap-1 rounded-md bg-slate-600 px-2 py-1 text-[11px] font-bold text-white active:bg-slate-700">← 個別売上</Link>
        <h1 className="text-lg font-bold text-slate-800">物販</h1>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => gotoMonth(-1)} className={btn}>‹</button>
          <span className="min-w-[86px] text-center text-sm font-bold text-slate-700">{monthLabel}</span>
          <button onClick={() => gotoMonth(1)} className={btn}>›</button>
        </div>
      </div>

      {/* 利益サマリー（担当別） */}
      <div className="mb-4 rounded-xl border bg-white p-3">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 text-sm">
          <span className="font-bold text-slate-700">{monthLabel} 物販</span>
          <span className="text-slate-500">売上 <b className="tabnum text-slate-700">{yen(totalSales)}</b></span>
          <span className="text-slate-500">利益 <b className="tabnum text-emerald-700">{yen(totalProfit)}</b></span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {assignees.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg border p-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="text-sm font-bold text-slate-800">{s.name}</span>
              <span className="ml-auto text-sm font-bold tabnum text-slate-700">{yen(byStaff.get(s.id) ?? 0)}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-lg border p-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-400" />
            <span className="text-sm font-bold text-slate-800">未割当</span>
            <span className="ml-auto text-sm font-bold tabnum text-slate-700">{yen(byStaff.get("__none") ?? 0)}</span>
          </div>
        </div>
      </div>

      {/* 商品マスタ */}
      <div className="mb-4 rounded-xl border bg-white">
        <button onClick={() => setMasterOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-bold text-slate-700">
          <span>商品マスタ（仕入れ・販売価格）</span>
          <span className="text-slate-400">{masterOpen ? "▲ 閉じる" : `▼ ${products.length}件`}</span>
        </button>
        {masterOpen && (
          <div className="border-t p-2">
            <table className="w-full text-sm">
              <thead className="text-[11px] text-slate-500">
                <tr>
                  <th className="px-1 py-1 text-left font-bold">商品名</th>
                  <th className="px-1 py-1 text-right font-bold">仕入れ</th>
                  <th className="px-1 py-1 text-right font-bold">販売価格</th>
                  <th className="px-1 py-1 text-right font-bold">利益</th>
                  <th className="px-1 py-1"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {products.map((p) => (
                  <tr key={p.id}>
                    <td className="px-1 py-1">
                      <input value={p.name} placeholder="商品名" onChange={(e) => setProductLocal(p.id, { name: e.target.value })} onBlur={() => persistProduct(p.id)} className="w-full rounded border border-slate-300 px-1 py-1 text-sm" />
                    </td>
                    <td className="px-1 py-1 text-right">
                      <input type="number" min={0} value={p.cost || ""} placeholder="0" onChange={(e) => setProductLocal(p.id, { cost: parseInt(e.target.value || "0", 10) })} onBlur={() => persistProduct(p.id)} className={amt} />
                    </td>
                    <td className="px-1 py-1 text-right">
                      <input type="number" min={0} value={p.price || ""} placeholder="0" onChange={(e) => setProductLocal(p.id, { price: parseInt(e.target.value || "0", 10) })} onBlur={() => persistProduct(p.id)} className={amt} />
                    </td>
                    <td className="px-1 py-1 text-right tabnum font-bold text-emerald-700">{(p.price - p.cost).toLocaleString()}</td>
                    <td className="px-1 py-1 text-center">
                      <button onClick={() => deleteProduct(p.id)} className="text-[11px] font-bold text-red-400">削除</button>
                    </td>
                  </tr>
                ))}
                {products.length === 0 && <tr><td colSpan={5} className="px-2 py-4 text-center text-xs text-slate-400">商品がありません。「＋商品を追加」から登録してください。</td></tr>}
              </tbody>
            </table>
            <button onClick={addProduct} className="mt-2 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white active:bg-blue-700">＋ 商品を追加</button>
          </div>
        )}
      </div>

      {/* 物販売上 */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-bold text-slate-700">物販売上</span>
        <button onClick={addSale} className="ml-auto rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white active:bg-blue-700">＋ 物販を追加</button>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-[11px] text-slate-500">
            <tr>
              <th className="px-1 py-2 text-left font-bold">日付</th>
              <th className="px-2 py-2 text-left font-bold">名前</th>
              <th className="px-1 py-2 text-left font-bold">商品</th>
              <th className="px-1 py-2 text-right font-bold">販売</th>
              <th className="px-1 py-2 text-right font-bold">仕入</th>
              <th className="px-1 py-2 text-center font-bold">数量</th>
              <th className="px-1 py-2 text-right font-bold">利益</th>
              <th className="px-1 py-2 text-left font-bold">担当</th>
              <th className="px-1 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={9} className="px-2 py-8 text-center text-sm text-slate-400">読み込み中…</td></tr>
            ) : sales.length === 0 ? (
              <tr><td colSpan={9} className="px-2 py-8 text-center text-sm text-slate-400">この月の物販はありません。「＋物販を追加」から入力してください。</td></tr>
            ) : (
              sales.map((s) => {
                const c = colorOf(s.staff_id);
                return (
                  <tr key={s.id}>
                    <td className="px-1 py-1">
                      <input type="date" value={s.date} onChange={(e) => e.target.value && setSaleLocal(s.id, { date: e.target.value })} onBlur={() => persistSale(s.id)} className="rounded border border-slate-300 px-1 py-1 text-[12px]" />
                    </td>
                    <td className="px-2 py-1">
                      <input value={s.patient_name ?? ""} placeholder="名前" onChange={(e) => setSaleLocal(s.id, { patient_name: e.target.value })} onBlur={() => persistSale(s.id)} className="w-24 rounded border border-slate-300 px-1 py-1 text-sm" />
                    </td>
                    <td className="px-1 py-1">
                      <select value={s.product_id ?? ""} onChange={(e) => { pickProduct(s, e.target.value); }} onBlur={() => persistSale(s.id)} className="max-w-[120px] rounded border border-slate-300 px-1 py-1 text-[12px]">
                        <option value="">選択</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name || "（無名）"}</option>)}
                      </select>
                    </td>
                    <td className="px-1 py-1 text-right">
                      <input type="number" min={0} value={unit(s.selfpay, s.qty || 1) || ""} placeholder="0" onChange={(e) => setUnitPrice(s, parseInt(e.target.value || "0", 10))} onBlur={() => persistSale(s.id)} className={amt} />
                    </td>
                    <td className="px-1 py-1 text-right">
                      <input type="number" min={0} value={unit(s.cost, s.qty || 1) || ""} placeholder="0" onChange={(e) => setUnitCost(s, parseInt(e.target.value || "0", 10))} onBlur={() => persistSale(s.id)} className="w-[68px] rounded border border-amber-300 bg-amber-50 px-1 py-1 text-right text-sm tabnum focus:outline-none" />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <input type="number" min={1} value={s.qty || 1} onChange={(e) => setQty(s, Math.max(1, parseInt(e.target.value || "1", 10)))} onBlur={() => persistSale(s.id)} className="w-[46px] rounded border border-slate-300 px-1 py-1 text-center text-sm tabnum focus:outline-none" />
                    </td>
                    <td className="px-1 py-1 text-right tabnum font-bold text-emerald-700">{profit(s).toLocaleString()}</td>
                    <td className="px-1 py-1">
                      <select value={s.staff_id ?? ""} onChange={(e) => setSaleLocal(s.id, { staff_id: e.target.value || null })} onBlur={() => persistSale(s.id)}
                        className="rounded border px-1 py-1 text-[11px] font-bold" style={c ? { backgroundColor: c, color: "#fff", borderColor: c } : { backgroundColor: "#f1f5f9", color: "#64748b", borderColor: "#e2e8f0" }}>
                        <option value="" style={{ color: "#0f172a", background: "#fff" }}>-</option>
                        {assignees.map((a) => <option key={a.id} value={a.id} style={{ color: "#0f172a", background: "#fff" }}>{a.name}</option>)}
                      </select>
                    </td>
                    <td className="px-1 py-1 text-center">
                      <button onClick={() => deleteSale(s.id)} className="text-[11px] font-bold text-red-400">削除</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-400">
        商品を選ぶと販売価格・仕入れが自動で入り、行ごとに編集できます。利益＝（販売−仕入）×数量。物販の売上は個別売上（担当ごとの集計・年間一覧）に、担当の粗利として反映されます。
      </p>
    </div>
  );
}
