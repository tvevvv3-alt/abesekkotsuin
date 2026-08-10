"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toDateStr } from "@/lib/booking";

interface NP {
  id: string;
  chart_no: string;
  date: string;
  insurance: string;
  name: string;
  kana: string;
  existing_no: string;
  category: string;
  referrer: string;
  area_code: string;
  area: string;
  taikan: boolean;
  kawanishi: boolean;
}

const COLS = "id, chart_no, date, insurance, name, kana, existing_no, category, referrer, area_code, area, taikan, kawanishi";
const AREA_CODES = ["", "茨", "高", "摂", "他"];

// カルテ番号の昇順で並べる。番号未入力の行は末尾（追加直後の入力中の行が動かないように）。
function byChart(a: NP, b: NP): number {
  const ta = (a.chart_no ?? "").trim();
  const tb = (b.chart_no ?? "").trim();
  const na = Number(ta), nb = Number(tb);
  const va = ta !== "" && !isNaN(na);
  const vb = tb !== "" && !isNaN(nb);
  if (va && vb) return na - nb;      // どちらも数値 → 数値順
  if (va !== vb) return va ? -1 : 1; // 数値ありを前、空/非数値を後ろ
  return ta.localeCompare(tb);       // どちらも非数値 → 文字列順
}

export default function NewPatientBoard() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<NP[]>([]);
  const [date, setDate] = useState(() => toDateStr(new Date()));
  const [loading, setLoading] = useState(true);

  const monthStart = useMemo(() => date.slice(0, 8) + "01", [date]);
  const monthEnd = useMemo(() => {
    const [y, m] = date.split("-").map(Number);
    return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  }, [date]);
  const monthLabel = useMemo(() => {
    const d = new Date(date + "T00:00:00");
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  }, [date]);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("new_patients").select(COLS).gte("date", monthStart).lt("date", monthEnd).order("date");
    setRows([...((data as NP[]) ?? [])].sort(byChart));
    setLoading(false);
  }, [supabase, monthStart, monthEnd]);
  useEffect(() => { reload(); }, [reload]);

  async function addRow() {
    const { data, error } = await supabase.from("new_patients").insert({ date }).select(COLS).single();
    if (error) { alert("新患を追加できませんでした：\n" + error.message + "\n（migration_new_patients.sql を実行済みかご確認ください）"); return; }
    if (data) setRows((r) => [...r, data as NP]);
  }
  function setLocal(id: string, patch: Partial<NP>) {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  async function persist(id: string) {
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    const { id: _id, ...rest } = r;
    void _id;
    await supabase.from("new_patients").update(rest).eq("id", id);
    setRows((rs) => [...rs].sort(byChart)); // 入力確定（onBlur）後にカルテ番号順へ並べ直す
  }
  async function persistNow(id: string, patch: Partial<NP>) {
    setLocal(id, patch);
    await supabase.from("new_patients").update(patch).eq("id", id);
  }
  async function deleteRow(id: string) {
    if (!confirm("この新患の記録を削除しますか？")) return;
    setRows((r) => r.filter((x) => x.id !== id));
    await supabase.from("new_patients").delete().eq("id", id);
  }

  const gotoMonth = (dir: number) => {
    const [y, m] = date.split("-").map(Number);
    const nm = m + dir;
    const ny = nm < 1 ? y - 1 : nm > 12 ? y + 1 : y;
    const mm = ((nm - 1 + 12) % 12) + 1;
    setDate(`${ny}-${String(mm).padStart(2, "0")}-01`);
  };
  const btn = "flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 active:bg-slate-100";
  const inp = "w-full rounded border border-slate-300 px-1 py-1 text-sm focus:border-blue-400 focus:outline-none";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="/admin" className="flex shrink-0 items-center gap-1 rounded-md bg-slate-600 px-2 py-1 text-[11px] font-bold text-white active:bg-slate-700">← 予約一覧</Link>
        <h1 className="text-lg font-bold text-slate-800">新患名簿</h1>
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-600">{monthLabel} {rows.length}人</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => gotoMonth(-1)} className={btn}>‹</button>
          <span className="min-w-[86px] text-center text-sm font-bold text-slate-700">{monthLabel}</span>
          <button onClick={() => gotoMonth(1)} className={btn}>›</button>
        </div>
      </div>

      <div className="mb-2 flex">
        <button onClick={addRow} className="ml-auto rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white active:bg-blue-700">＋ 新患を追加</button>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[1040px] text-sm">
          <thead className="bg-slate-50 text-[11px] text-slate-500">
            <tr>
              <th className="px-1 py-2 text-left font-bold">カルテ番号</th>
              <th className="px-1 py-2 text-left font-bold">日付</th>
              <th className="px-1 py-2 text-left font-bold">保険種別</th>
              <th className="px-1 py-2 text-left font-bold">氏名</th>
              <th className="px-1 py-2 text-left font-bold">フリガナ</th>
              <th className="px-1 py-2 text-left font-bold">既存番号</th>
              <th className="px-1 py-2 text-left font-bold">種別</th>
              <th className="px-1 py-2 text-left font-bold">紹介者</th>
              <th className="px-1 py-2 text-left font-bold">住所</th>
              <th className="px-1 py-2 text-center font-bold">体幹</th>
              <th className="px-1 py-2 text-center font-bold">川西</th>
              <th className="px-1 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={12} className="px-2 py-8 text-center text-sm text-slate-400">読み込み中…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={12} className="px-2 py-8 text-center text-sm text-slate-400">この月の新患はありません。「＋新患を追加」から入力してください。</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-1 py-1"><input value={r.chart_no} placeholder="番号" onChange={(e) => setLocal(r.id, { chart_no: e.target.value })} onBlur={() => persist(r.id)} className={`${inp} w-[72px] font-bold`} /></td>
                  <td className="px-1 py-1"><input type="date" value={r.date} onChange={(e) => e.target.value && setLocal(r.id, { date: e.target.value })} onBlur={() => persist(r.id)} className="rounded border border-slate-300 px-1 py-1 text-[12px]" /></td>
                  <td className="px-1 py-1"><input value={r.insurance} placeholder="自費/組合家族" onChange={(e) => setLocal(r.id, { insurance: e.target.value })} onBlur={() => persist(r.id)} className={`${inp} w-[92px]`} /></td>
                  <td className="px-1 py-1"><input value={r.name} placeholder="氏名" onChange={(e) => setLocal(r.id, { name: e.target.value })} onBlur={() => persist(r.id)} className={`${inp} w-[96px]`} /></td>
                  <td className="px-1 py-1"><input value={r.kana} placeholder="フリガナ" onChange={(e) => setLocal(r.id, { kana: e.target.value })} onBlur={() => persist(r.id)} className={`${inp} w-[110px]`} /></td>
                  <td className="px-1 py-1"><input value={r.existing_no} placeholder="—" onChange={(e) => setLocal(r.id, { existing_no: e.target.value })} onBlur={() => persist(r.id)} className={`${inp} w-[64px]`} /></td>
                  <td className="px-1 py-1"><input value={r.category} placeholder="種別" onChange={(e) => setLocal(r.id, { category: e.target.value })} onBlur={() => persist(r.id)} className={`${inp} w-[88px]`} /></td>
                  <td className="px-1 py-1"><input value={r.referrer} placeholder="紹介者" onChange={(e) => setLocal(r.id, { referrer: e.target.value })} onBlur={() => persist(r.id)} className={`${inp} w-[120px]`} /></td>
                  <td className="px-1 py-1">
                    <div className="flex items-center gap-1">
                      <select value={r.area_code} onChange={(e) => persistNow(r.id, { area_code: e.target.value })} className="rounded border border-slate-300 px-1 py-1 text-[12px]">
                        {AREA_CODES.map((a) => <option key={a} value={a}>{a || "—"}</option>)}
                      </select>
                      <input value={r.area} placeholder="住所" onChange={(e) => setLocal(r.id, { area: e.target.value })} onBlur={() => persist(r.id)} className={`${inp} w-[110px]`} />
                    </div>
                  </td>
                  <td className="px-1 py-1 text-center"><input type="checkbox" checked={r.taikan} onChange={(e) => persistNow(r.id, { taikan: e.target.checked })} className="h-4 w-4" /></td>
                  <td className="px-1 py-1 text-center"><input type="checkbox" checked={r.kawanishi} onChange={(e) => persistNow(r.id, { kawanishi: e.target.checked })} className="h-4 w-4" /></td>
                  <td className="px-1 py-1 text-center"><button onClick={() => deleteRow(r.id)} className="text-[11px] font-bold text-red-400">削除</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-400">
        完全手入力の名簿です。住所は区分（茨/高/摂/他）＋エリア名。体幹・川西はチェックで記録します。‹ › で月を移動できます。
      </p>
    </div>
  );
}
