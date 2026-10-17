"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { loadAllStaff } from "@/lib/data";
import { toDateStr } from "@/lib/booking";
import type { Staff } from "@/lib/types";

export type TimeCard = {
  staff_id: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  break_min: number;
  break_started_at: string | null;
};

type St = "off" | "working" | "break" | "done";
const ST_LABEL: Record<St, string> = { off: "未出勤", working: "勤務中", break: "休憩中", done: "退勤済" };
const ST_COLOR: Record<St, string> = { off: "#94a3b8", working: "#16a34a", break: "#f59e0b", done: "#64748b" };

function statusOf(c?: TimeCard): St {
  if (!c || !c.clock_in) return "off";
  if (c.break_started_at) return "break";
  if (c.clock_out) return "done";
  return "working";
}
const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "—");
function workedMin(c?: TimeCard): number {
  if (!c || !c.clock_in || !c.clock_out) return 0;
  const m = (new Date(c.clock_out).getTime() - new Date(c.clock_in).getTime()) / 60000 - (c.break_min || 0);
  return Math.max(0, Math.round(m));
}
const hm = (min: number) => `${Math.floor(min / 60)}時間${String(min % 60).padStart(2, "0")}分`;

export default function TimeClock() {
  const supabase = useMemo(() => createClient(), []);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [cards, setCards] = useState<Record<string, TimeCard>>({});
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Staff | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const today = useMemo(() => toDateStr(new Date()), []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const all = await loadAllStaff(supabase).catch(() => [] as Staff[]);
    const working = all.filter((s) => s.active && s.status !== "retired" && s.status !== "hidden");
    setStaff(working);
    const { data } = await supabase.from("time_cards").select("staff_id, date, clock_in, clock_out, break_min, break_started_at").eq("date", today);
    const map: Record<string, TimeCard> = {};
    (data as TimeCard[] ?? []).forEach((c) => { map[c.staff_id] = c; });
    setCards(map);
    setLoading(false);
  }, [supabase, today]);
  useEffect(() => { load(); }, [load]);

  async function apply(s: Staff, patch: Partial<TimeCard>, label: string) {
    setBusy(true);
    const cur = cards[s.id] ?? { staff_id: s.id, date: today, clock_in: null, clock_out: null, break_min: 0, break_started_at: null };
    const next: TimeCard = { ...cur, ...patch };
    const { error } = await supabase.from("time_cards").upsert({
      staff_id: s.id, date: today,
      clock_in: next.clock_in, clock_out: next.clock_out, break_min: next.break_min, break_started_at: next.break_started_at,
      updated_at: new Date().toISOString(),
    }, { onConflict: "staff_id,date" });
    setBusy(false);
    if (error) { setToast(`保存に失敗：${error.message}（migration_time_cards.sql を実行済みかご確認ください）`); return; }
    setCards((m) => ({ ...m, [s.id]: next }));
    setSel(null);
    setToast(`${s.display_name || s.name}さん　${label}　${new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`);
    setTimeout(() => setToast(null), 3500);
  }

  const nowISO = () => new Date().toISOString();
  const addBreak = (c: TimeCard) => (c.break_started_at ? Math.max(0, Math.round((Date.now() - new Date(c.break_started_at).getTime()) / 60000)) : 0);

  const clockIn = (s: Staff) => apply(s, { clock_in: nowISO(), clock_out: null, break_started_at: null }, "出勤");
  const breakIn = (s: Staff) => apply(s, { break_started_at: nowISO() }, "休憩入り");
  const breakOut = (s: Staff) => { const c = cards[s.id]; if (!c) return; apply(s, { break_min: (c.break_min || 0) + addBreak(c), break_started_at: null }, "休憩戻り"); };
  const clockOut = (s: Staff) => { const c = cards[s.id]; apply(s, { clock_out: nowISO(), break_started_at: null, break_min: (c?.break_min || 0) + (c ? addBreak(c) : 0) }, "退勤"); };
  const undoOut = (s: Staff) => apply(s, { clock_out: null }, "退勤取消");

  const selSt = sel ? statusOf(cards[sel.id]) : "off";
  const selCard = sel ? cards[sel.id] : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="/admin" className="rounded-md bg-slate-600 px-2 py-1 text-[11px] font-bold text-white active:bg-slate-700">← 予約一覧</Link>
        <h1 className="text-lg font-bold text-slate-800">タイムカード</h1>
        <Link href="/admin/timecard/report" className="ml-auto rounded-md border border-slate-300 bg-white px-3 py-1 text-[11px] font-bold text-slate-600 active:bg-slate-100">📊 勤怠集計</Link>
      </div>

      {/* 現在時刻 */}
      <div className="mb-4 rounded-2xl border bg-white px-4 py-3 text-center">
        <div className="text-sm font-bold text-slate-400">{now.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" })}</div>
        <div className="text-4xl font-bold tabular-nums tracking-wide text-slate-800">{now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
        <div className="mt-1 text-xs text-slate-400">名前をタップして打刻してください</div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-slate-400">読み込み中…</div>
      ) : staff.length === 0 ? (
        <p className="rounded-xl border bg-white px-4 py-10 text-center text-sm text-slate-400">スタッフが登録されていません。</p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {staff.map((s) => {
            const c = cards[s.id];
            const st = statusOf(c);
            return (
              <button
                key={s.id}
                onClick={() => setSel(s)}
                className="flex flex-col items-start gap-1 rounded-xl border bg-white p-3 text-left active:scale-[0.98]"
                style={{ borderColor: st === "off" ? undefined : ST_COLOR[st], borderWidth: st === "off" ? 1 : 2 }}
              >
                <div className="flex w-full items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-base font-bold text-slate-800">{s.display_name || s.name}</span>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: ST_COLOR[st] }}>{ST_LABEL[st]}</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {c?.clock_in ? `出 ${fmtTime(c.clock_in)}` : "未出勤"}
                  {c?.clock_out ? ` / 退 ${fmtTime(c.clock_out)}` : ""}
                  {c && (c.break_min > 0 || c.break_started_at) ? ` / 休${c.break_min}分` : ""}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 打刻モーダル */}
      {sel && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !busy && setSel(null)} />
          <div className="relative w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <div className="mb-1 flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800">{sel.display_name || sel.name}</h2>
              <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ backgroundColor: ST_COLOR[selSt] }}>{ST_LABEL[selSt]}</span>
              <button onClick={() => !busy && setSel(null)} className="ml-auto text-slate-400">✕</button>
            </div>
            <div className="mb-4 text-xs text-slate-500">
              出勤 {fmtTime(selCard?.clock_in ?? null)}　/　退勤 {fmtTime(selCard?.clock_out ?? null)}　/　休憩 {selCard?.break_min ?? 0}分
              {selCard?.clock_in && selCard?.clock_out ? <span className="ml-1 font-bold text-slate-700">（実働 {hm(workedMin(selCard))}）</span> : null}
            </div>

            <div className="grid grid-cols-1 gap-2">
              {selSt === "off" && (
                <button disabled={busy} onClick={() => clockIn(sel)} className="rounded-xl bg-green-600 py-4 text-lg font-bold text-white active:bg-green-700 disabled:opacity-50">出勤</button>
              )}
              {selSt === "working" && (
                <>
                  <button disabled={busy} onClick={() => breakIn(sel)} className="rounded-xl bg-amber-500 py-4 text-lg font-bold text-white active:bg-amber-600 disabled:opacity-50">休憩入り</button>
                  <button disabled={busy} onClick={() => clockOut(sel)} className="rounded-xl bg-slate-700 py-4 text-lg font-bold text-white active:bg-slate-800 disabled:opacity-50">退勤</button>
                </>
              )}
              {selSt === "break" && (
                <button disabled={busy} onClick={() => breakOut(sel)} className="rounded-xl bg-green-600 py-4 text-lg font-bold text-white active:bg-green-700 disabled:opacity-50">休憩戻り</button>
              )}
              {selSt === "done" && (
                <button disabled={busy} onClick={() => undoOut(sel)} className="rounded-xl border border-slate-300 py-3 text-sm font-bold text-slate-600 active:bg-slate-100 disabled:opacity-50">退勤を取り消す（勤務に戻す）</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* トースト */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-slate-800 px-5 py-2.5 text-sm font-bold text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
}
