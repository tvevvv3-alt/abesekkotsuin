"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { loadAllStaff } from "@/lib/data";
import { toDateStr, WEEKDAY_LABELS } from "@/lib/booking";
import type { Staff } from "@/lib/types";
import type { TimeCard } from "@/components/TimeClock";

const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "");
// HH:MM（JST）を timestamptz(ISO) に。空なら null。
function toISO(date: string, hhmm: string): string | null {
  if (!hhmm.trim()) return null;
  const d = new Date(`${date}T${hhmm}:00+09:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function workedMin(c?: TimeCard | null): number {
  if (!c || !c.clock_in || !c.clock_out) return 0;
  const m = (new Date(c.clock_out).getTime() - new Date(c.clock_in).getTime()) / 60000 - (c.break_min || 0);
  return Math.max(0, Math.round(m));
}
const hm = (min: number) => (min > 0 ? `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}` : "—");

export default function AttendanceBoard() {
  const supabase = useMemo(() => createClient(), []);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [staffId, setStaffId] = useState<string>("");
  // month(YYYY-MM)は「締め月」を表す。給与は20日締め＝前月21日〜締め月20日が1期間。
  const [month, setMonth] = useState(() => {
    const t = new Date(); let y = t.getFullYear(), m = t.getMonth() + 1;
    if (t.getDate() >= 21) { m++; if (m > 12) { m = 1; y++; } } // 21日以降は翌月度
    return `${y}-${String(m).padStart(2, "0")}`;
  });
  const [cards, setCards] = useState<Record<string, TimeCard>>({}); // key=date
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<{ date: string; cin: string; cout: string; brk: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // 締め期間：前月21日〜締め月20日
  const [cy, cm] = month.split("-").map(Number);
  const periodStart = useMemo(() => toDateStr(new Date(cy, cm - 2, 21)), [cy, cm]); // 前月21日
  const periodEndExcl = useMemo(() => toDateStr(new Date(cy, cm - 1, 21)), [cy, cm]); // 当月21日（<で使う）
  const days = useMemo(() => {
    const out: string[] = [];
    const d = new Date(cy, cm - 2, 21), end = new Date(cy, cm - 1, 20);
    while (d <= end) { out.push(toDateStr(new Date(d))); d.setDate(d.getDate() + 1); }
    return out;
  }, [cy, cm]);

  useEffect(() => {
    (async () => {
      const all = await loadAllStaff(supabase).catch(() => [] as Staff[]);
      const working = all.filter((s) => s.active && s.status !== "retired" && s.status !== "hidden");
      setStaff(working);
      if (working.length && !staffId) setStaffId(working[0].id);
    })();
  }, [supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    const { data } = await supabase.from("time_cards")
      .select("staff_id, date, clock_in, clock_out, break_min, break_started_at")
      .eq("staff_id", staffId).gte("date", periodStart).lt("date", periodEndExcl);
    const map: Record<string, TimeCard> = {};
    (data as TimeCard[] ?? []).forEach((c) => { map[c.date] = c; });
    setCards(map);
    setLoading(false);
  }, [supabase, staffId, periodStart, periodEndExcl]);
  useEffect(() => { load(); }, [load]);

  const gotoMonth = (dir: number) => {
    const [y, m] = month.split("-").map(Number);
    const nm = m + dir, ny = nm < 1 ? y - 1 : nm > 12 ? y + 1 : y, mm = ((nm - 1 + 12) % 12) + 1;
    setMonth(`${ny}-${String(mm).padStart(2, "0")}`);
  };

  const openEdit = (date: string) => {
    const c = cards[date];
    setEdit({ date, cin: fmtTime(c?.clock_in ?? null), cout: fmtTime(c?.clock_out ?? null), brk: String(c?.break_min ?? 0) });
  };
  async function saveEdit() {
    if (!edit || !staffId) return;
    setBusy(true);
    const { error } = await supabase.from("time_cards").upsert({
      staff_id: staffId, date: edit.date,
      clock_in: toISO(edit.date, edit.cin), clock_out: toISO(edit.date, edit.cout),
      break_min: Math.max(0, parseInt(edit.brk || "0", 10) || 0), break_started_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "staff_id,date" });
    setBusy(false);
    if (error) { alert("保存に失敗：" + error.message); return; }
    await load();
    setEdit(null);
  }
  async function clearDay() {
    if (!edit || !staffId) return;
    if (!confirm(`${edit.date} の打刻を削除しますか？`)) return;
    setBusy(true);
    await supabase.from("time_cards").delete().eq("staff_id", staffId).eq("date", edit.date);
    setBusy(false);
    await load();
    setEdit(null);
  }

  const totalMin = days.reduce((n, d) => n + workedMin(cards[d]), 0);
  const workDays = days.filter((d) => cards[d]?.clock_in).length;
  const periodLabel = `${cm}月度`;
  const rangeLabel = `${new Date(cy, cm - 2, 21).getMonth() + 1}/21〜${cm}/20`;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="/admin/timecard" className="rounded-md bg-slate-600 px-2 py-1 text-[11px] font-bold text-white active:bg-slate-700">← 打刻</Link>
        <h1 className="text-lg font-bold text-slate-800">勤怠集計</h1>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => gotoMonth(-1)} className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 active:bg-slate-100">‹</button>
          <div className="min-w-[108px] text-center leading-tight">
            <div className="text-sm font-bold text-slate-700">{periodLabel}</div>
            <div className="text-[10px] text-slate-400">{rangeLabel}</div>
          </div>
          <button onClick={() => gotoMonth(1)} className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 active:bg-slate-100">›</button>
        </div>
      </div>

      {/* スタッフ選択 */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {staff.map((s) => (
          <button key={s.id} onClick={() => setStaffId(s.id)} className={`rounded-full px-3 py-1 text-xs font-bold ${staffId === s.id ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-500"}`}>{s.display_name || s.name}</button>
        ))}
      </div>

      {/* 月サマリ */}
      <div className="mb-3 flex gap-3 rounded-xl border bg-white p-3">
        <div><div className="text-[11px] font-bold text-slate-400">出勤日数</div><div className="text-xl font-bold text-slate-800">{workDays}<span className="ml-0.5 text-sm font-normal text-slate-400">日</span></div></div>
        <div className="border-l pl-3"><div className="text-[11px] font-bold text-slate-400">実働合計</div><div className="text-xl font-bold text-slate-800">{Math.floor(totalMin / 60)}<span className="text-sm font-normal text-slate-400">時間</span>{String(totalMin % 60).padStart(2, "0")}<span className="text-sm font-normal text-slate-400">分</span></div></div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-slate-400">読み込み中…</div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] text-slate-500">
              <tr>
                <th className="px-2 py-2 text-left font-bold">日付</th>
                <th className="px-2 py-2 text-center font-bold">出勤</th>
                <th className="px-2 py-2 text-center font-bold">退勤</th>
                <th className="px-2 py-2 text-center font-bold">休憩</th>
                <th className="px-2 py-2 text-center font-bold">実働</th>
                <th className="px-1 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {days.map((d) => {
                const c = cards[d];
                const wd = new Date(d + "T00:00:00").getDay();
                const w = workedMin(c);
                return (
                  <tr key={d} className={wd === 0 ? "bg-rose-50/40" : wd === 6 ? "bg-blue-50/40" : ""}>
                    <td className="px-2 py-1.5 font-bold text-slate-600">{Number(d.slice(8))}<span className={`ml-1 text-[11px] ${wd === 0 ? "text-rose-500" : wd === 6 ? "text-blue-500" : "text-slate-400"}`}>{WEEKDAY_LABELS[wd]}</span></td>
                    <td className="px-2 py-1.5 text-center tabular-nums text-slate-700">{fmtTime(c?.clock_in ?? null) || "—"}</td>
                    <td className="px-2 py-1.5 text-center tabular-nums text-slate-700">{fmtTime(c?.clock_out ?? null) || "—"}</td>
                    <td className="px-2 py-1.5 text-center tabular-nums text-slate-500">{c?.break_min ? `${c.break_min}分` : "—"}</td>
                    <td className="px-2 py-1.5 text-center tabular-nums font-bold text-slate-800">{hm(w)}</td>
                    <td className="px-1 py-1.5 text-center"><button onClick={() => openEdit(d)} className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] font-bold text-slate-400 active:bg-slate-100">修正</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-400">20日締め（前月21日〜当月20日）で集計。実働＝退勤−出勤−休憩。打刻忘れ・修正は各行の「修正」から手入力できます。</p>

      {/* 修正モーダル */}
      {edit && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !busy && setEdit(null)} />
          <div className="relative w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <h2 className="mb-3 text-base font-bold text-slate-800">{Number(edit.date.slice(8))}日（{WEEKDAY_LABELS[new Date(edit.date + "T00:00:00").getDay()]}）の打刻</h2>
            <div className="space-y-3">
              <label className="flex items-center justify-between gap-2 text-sm"><span className="font-bold text-slate-500">出勤</span><input type="time" value={edit.cin} onChange={(e) => setEdit({ ...edit, cin: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-1.5" /></label>
              <label className="flex items-center justify-between gap-2 text-sm"><span className="font-bold text-slate-500">退勤</span><input type="time" value={edit.cout} onChange={(e) => setEdit({ ...edit, cout: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-1.5" /></label>
              <label className="flex items-center justify-between gap-2 text-sm"><span className="font-bold text-slate-500">休憩（分）</span><input type="number" inputMode="numeric" min={0} value={edit.brk} onChange={(e) => setEdit({ ...edit, brk: e.target.value })} className="w-24 rounded-lg border border-slate-300 px-3 py-1.5" /></label>
            </div>
            <div className="mt-5 flex items-center gap-2">
              <button onClick={clearDay} disabled={busy} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-bold text-rose-500 active:bg-rose-50 disabled:opacity-50">削除</button>
              <button onClick={() => setEdit(null)} disabled={busy} className="ml-auto rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-500 active:bg-slate-100 disabled:opacity-50">キャンセル</button>
              <button onClick={saveEdit} disabled={busy} className="rounded-lg bg-teal-600 px-6 py-2 text-sm font-bold text-white active:bg-teal-700 disabled:opacity-50">{busy ? "保存中…" : "保存"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
