"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { loadAllStaff } from "@/lib/data";
import { toDateStr } from "@/lib/booking";

interface Member {
  id: string;
  name: string;
  role: "therapist" | "reception" | "student" | "other";
  color: string;
  default_start: number | null;
  default_end: number | null;
  sort_order: number;
  active: boolean;
}
interface Shift {
  id: string;
  date: string;
  member_id: string;
  start_min: number | null;
  end_min: number | null;
  clinic: string | null;
  note: string | null;
}

const WD = ["日", "月", "火", "水", "木", "金", "土"];
const ROLE_LABEL: Record<Member["role"], string> = { therapist: "施術", reception: "受付", student: "学生", other: "その他" };
const ROLE_ORDER: Record<Member["role"], number> = { therapist: 0, reception: 1, student: 2, other: 3 };
const SWATCHES = ["#1e40af", "#2e7d32", "#7b1fa2", "#EF6C00", "#3F51B5", "#0891b2", "#be123c", "#64748b"];

const pad = (n: number) => String(n).padStart(2, "0");
const minToTime = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const timeToMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
const short = (m: number) => (m % 60 === 0 ? String(Math.floor(m / 60)) : `${Math.floor(m / 60)}:${pad(m % 60)}`);
const range = (s: number | null, e: number | null) => (s == null ? "" : e == null ? `${short(s)}〜` : `${short(s)}-${short(e)}`);

type Draft = Record<string, { on: boolean; start: string; end: string; clinic: boolean }>;

export default function ShiftBoard() {
  const supabase = useMemo(() => createClient(), []);
  const [members, setMembers] = useState<Member[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [date, setDate] = useState(() => toDateStr(new Date()));
  const [loading, setLoading] = useState(true);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [edit, setEdit] = useState<string | null>(null); // 編集中の日付
  const [draft, setDraft] = useState<Draft>({});

  const monthStart = useMemo(() => date.slice(0, 8) + "01", [date]);
  const monthEnd = useMemo(() => {
    const [y, m] = date.split("-").map(Number);
    return `${m === 12 ? y + 1 : y}-${pad(m === 12 ? 1 : m + 1)}-01`;
  }, [date]);
  const monthLabel = useMemo(() => { const d = new Date(date + "T00:00:00"); return `${d.getFullYear()}年${d.getMonth() + 1}月`; }, [date]);

  const loadMembers = useCallback(async () => {
    const { data } = await supabase.from("shift_members").select("id, name, role, color, default_start, default_end, sort_order, active").order("sort_order");
    setMembers((data as Member[]) ?? []);
  }, [supabase]);
  useEffect(() => { loadMembers(); }, [loadMembers]);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("shifts").select("id, date, member_id, start_min, end_min, clinic, note").gte("date", monthStart).lt("date", monthEnd);
    setShifts((data as Shift[]) ?? []);
    setLoading(false);
  }, [supabase, monthStart, monthEnd]);
  useEffect(() => { reload(); }, [reload]);

  const activeMembers = useMemo(() => members.filter((m) => m.active).sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.sort_order - b.sort_order), [members]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const shiftsByDate = useMemo(() => {
    const m = new Map<string, Shift[]>();
    shifts.forEach((s) => { const a = m.get(s.date) ?? []; a.push(s); m.set(s.date, a); });
    return m;
  }, [shifts]);

  // カレンダーの週（日〜土）。当月を含む週のみ。
  const weeks = useMemo(() => {
    const [y, m] = date.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const start = new Date(y, m - 1, 1 - first.getDay());
    const last = new Date(y, m, 0).getDate();
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) cells.push(new Date(y, m - 1, 1 - first.getDay() + i));
    void start;
    const rows: Date[][] = [];
    for (let i = 0; i < 42; i += 7) {
      const wk = cells.slice(i, i + 7);
      if (wk.some((d) => d.getMonth() === m - 1)) rows.push(wk);
      if (wk[6].getMonth() === m - 1 && wk[6].getDate() === last) break;
      if (wk[0].getMonth() === m - 1 && wk[0].getDate() > last) break;
    }
    return rows;
  }, [date]);

  const gotoMonth = (dir: number) => {
    const [y, m] = date.split("-").map(Number);
    const nm = m + dir; const ny = nm < 1 ? y - 1 : nm > 12 ? y + 1 : y; const mm = ((nm - 1 + 12) % 12) + 1;
    setDate(`${ny}-${pad(mm)}-01`);
  };

  function openDay(ds: string) {
    const day = shiftsByDate.get(ds) ?? [];
    const d: Draft = {};
    activeMembers.forEach((m) => {
      const sh = day.find((x) => x.member_id === m.id);
      d[m.id] = {
        on: !!sh,
        start: sh?.start_min != null ? minToTime(sh.start_min) : m.default_start != null ? minToTime(m.default_start) : "",
        end: sh?.end_min != null ? minToTime(sh.end_min) : m.default_end != null ? minToTime(m.default_end) : "",
        clinic: sh?.clinic === "kawanishi",
      };
    });
    setDraft(d); setEdit(ds);
  }
  async function saveDay() {
    if (!edit) return;
    await supabase.from("shifts").delete().eq("date", edit);
    const rows = activeMembers.filter((m) => draft[m.id]?.on).map((m) => ({
      date: edit, member_id: m.id,
      start_min: draft[m.id].start ? timeToMin(draft[m.id].start) : null,
      end_min: draft[m.id].end ? timeToMin(draft[m.id].end) : null,
      clinic: draft[m.id].clinic ? "kawanishi" : null,
    }));
    if (rows.length) await supabase.from("shifts").insert(rows);
    setEdit(null); reload();
  }

  // 出勤日数（当月・メンバー別）
  const countByMember = useMemo(() => {
    const m = new Map<string, Set<string>>();
    shifts.forEach((s) => { const set = m.get(s.member_id) ?? new Set(); set.add(s.date); m.set(s.member_id, set); });
    return m;
  }, [shifts]);

  // ---- メンバー（ロスター）編集 ----
  async function addMember() {
    const { data, error } = await supabase.from("shift_members").insert({ name: "", role: "therapist", color: "#64748b", sort_order: members.length }).select("id, name, role, color, default_start, default_end, sort_order, active").single();
    if (error) { alert("メンバーを追加できませんでした：\n" + error.message + "\n（migration_shifts.sql を実行済みかご確認ください）"); return; }
    if (data) setMembers((p) => [...p, data as Member]);
  }
  async function importStaff() {
    const staff = await loadAllStaff(supabase);
    const have = new Set(members.map((m) => m.name));
    const toAdd = staff.filter((s) => (s as unknown as { admin_visible?: boolean }).admin_visible !== false && !have.has(s.name));
    if (toAdd.length === 0) { alert("追加できる施術スタッフはありません（既に登録済み）。"); return; }
    const rows = toAdd.map((s, i) => ({ name: s.name, role: "therapist", color: s.color || "#64748b", sort_order: members.length + i }));
    const { error } = await supabase.from("shift_members").insert(rows);
    if (error) { alert("取込に失敗：\n" + error.message); return; }
    loadMembers();
  }
  function setMemberLocal(id: string, patch: Partial<Member>) { setMembers((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x))); }
  async function persistMember(id: string) {
    const m = members.find((x) => x.id === id); if (!m) return;
    await supabase.from("shift_members").update({ name: m.name, role: m.role, color: m.color, default_start: m.default_start, default_end: m.default_end, active: m.active }).eq("id", id);
  }
  async function deleteMember(id: string) {
    if (!confirm("このメンバーを削除しますか？（このメンバーの過去シフトも消えます）")) return;
    setMembers((p) => p.filter((x) => x.id !== id));
    await supabase.from("shift_members").delete().eq("id", id);
    reload();
  }

  const btn = "flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 active:bg-slate-100";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="/admin/staff" className="flex shrink-0 items-center gap-1 rounded-md bg-slate-600 px-2 py-1 text-[11px] font-bold text-white active:bg-slate-700">← スタッフ管理</Link>
        <h1 className="text-lg font-bold text-slate-800">シフト</h1>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => gotoMonth(-1)} className={btn}>‹</button>
          <button onClick={() => setDate(toDateStr(new Date()))} className="rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white active:bg-blue-700">今月</button>
          <span className="min-w-[86px] text-center text-sm font-bold text-slate-700">{monthLabel}</span>
          <button onClick={() => gotoMonth(1)} className={btn}>›</button>
        </div>
      </div>

      {/* 凡例＋出勤日数 */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-white p-2.5 text-[11px]">
        {activeMembers.map((m) => (
          <span key={m.id} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} />
            <span className="font-bold text-slate-700">{m.name || "（無名）"}</span>
            <span className="text-slate-400">{countByMember.get(m.id)?.size ?? 0}日</span>
          </span>
        ))}
        {activeMembers.length === 0 && <span className="text-slate-400">メンバー未登録。下の「メンバー設定」から追加してください。</span>}
      </div>

      {/* カレンダー */}
      <div className="overflow-x-auto rounded-xl border bg-white">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-7 border-b bg-slate-50 text-center text-[11px] font-bold">
            {WD.map((w, i) => <div key={w} className={`py-1.5 ${i === 0 ? "text-rose-500" : i === 6 ? "text-blue-500" : "text-slate-500"}`}>{w}</div>)}
          </div>
          {loading ? (
            <p className="py-10 text-center text-sm text-slate-400">読み込み中…</p>
          ) : (
            weeks.map((wk, wi) => (
              <div key={wi} className="grid grid-cols-7">
                {wk.map((d) => {
                  const ds = toDateStr(d);
                  const inMonth = ds.slice(0, 7) === date.slice(0, 7);
                  const day = (shiftsByDate.get(ds) ?? []).map((s) => ({ s, m: memberById.get(s.member_id) })).filter((x) => x.m) as { s: Shift; m: Member }[];
                  day.sort((a, b) => ROLE_ORDER[a.m.role] - ROLE_ORDER[b.m.role] || a.m.sort_order - b.m.sort_order);
                  const dow = d.getDay();
                  return (
                    <button key={ds} onClick={() => inMonth && openDay(ds)} disabled={!inMonth}
                      className={`min-h-[76px] border-b border-r p-1 text-left align-top ${inMonth ? "bg-white active:bg-blue-50" : "bg-slate-50/60"}`}>
                      <div className={`mb-0.5 text-[11px] font-bold ${!inMonth ? "text-slate-300" : dow === 0 ? "text-rose-500" : dow === 6 ? "text-blue-500" : "text-slate-500"}`}>{d.getDate()}</div>
                      {inMonth && (
                        <div className="flex flex-col gap-0.5">
                          {day.map(({ s, m }) => (
                            m.role === "therapist" ? (
                              <span key={s.id} className="inline-block truncate rounded px-1 text-[10px] font-bold leading-tight text-white" style={{ backgroundColor: m.color }}>
                                {m.name}{s.clinic === "kawanishi" ? "(川西)" : ""}{s.start_min != null ? " " + range(s.start_min, s.end_min) : ""}
                              </span>
                            ) : (
                              <span key={s.id} className="truncate text-[10px] font-bold leading-tight" style={{ color: m.color }}>
                                {m.name} {range(s.start_min, s.end_min)}
                              </span>
                            )
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-400">日をタップして、その日の出勤メンバー・時間帯を編集します。施術スタッフは色チップ、受付・学生は時間帯付きで表示。</p>

      {/* メンバー設定 */}
      <div className="mt-4 rounded-xl border bg-white">
        <button onClick={() => setRosterOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-bold text-slate-700">
          <span>メンバー設定（施術スタッフ・受付・学生）</span>
          <span className="text-slate-400">{rosterOpen ? "▲ 閉じる" : `▼ ${members.length}人`}</span>
        </button>
        {rosterOpen && (
          <div className="border-t p-2">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-[11px] text-slate-500">
                  <tr>
                    <th className="px-1 py-1 text-left font-bold">名前</th>
                    <th className="px-1 py-1 text-left font-bold">区分</th>
                    <th className="px-1 py-1 text-left font-bold">色</th>
                    <th className="px-1 py-1 text-left font-bold">既定の出勤時間</th>
                    <th className="px-1 py-1"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td className="px-1 py-1"><input value={m.name} placeholder="名前" onChange={(e) => setMemberLocal(m.id, { name: e.target.value })} onBlur={() => persistMember(m.id)} className="w-24 rounded border border-slate-300 px-1 py-1 text-sm" /></td>
                      <td className="px-1 py-1">
                        <select value={m.role} onChange={(e) => { setMemberLocal(m.id, { role: e.target.value as Member["role"] }); }} onBlur={() => persistMember(m.id)} className="rounded border border-slate-300 px-1 py-1 text-[12px]">
                          {(["therapist", "reception", "student", "other"] as const).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                        </select>
                      </td>
                      <td className="px-1 py-1">
                        <div className="flex items-center gap-1">
                          {SWATCHES.map((c) => (
                            <button key={c} onClick={() => { setMemberLocal(m.id, { color: c }); setTimeout(() => persistMember(m.id), 0); }}
                              className={`h-4 w-4 rounded-full ${m.color === c ? "ring-2 ring-offset-1 ring-slate-400" : ""}`} style={{ backgroundColor: c }} aria-label="色" />
                          ))}
                        </div>
                      </td>
                      <td className="px-1 py-1">
                        <div className="flex items-center gap-1">
                          <input type="time" value={m.default_start != null ? minToTime(m.default_start) : ""} onChange={(e) => setMemberLocal(m.id, { default_start: e.target.value ? timeToMin(e.target.value) : null })} onBlur={() => persistMember(m.id)} className="rounded border border-slate-300 px-1 py-1 text-[12px]" />
                          <span className="text-slate-400">-</span>
                          <input type="time" value={m.default_end != null ? minToTime(m.default_end) : ""} onChange={(e) => setMemberLocal(m.id, { default_end: e.target.value ? timeToMin(e.target.value) : null })} onBlur={() => persistMember(m.id)} className="rounded border border-slate-300 px-1 py-1 text-[12px]" />
                        </div>
                      </td>
                      <td className="px-1 py-1 text-center"><button onClick={() => deleteMember(m.id)} className="text-[11px] font-bold text-red-400">削除</button></td>
                    </tr>
                  ))}
                  {members.length === 0 && <tr><td colSpan={5} className="px-2 py-4 text-center text-xs text-slate-400">メンバーがいません。</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex gap-2">
              <button onClick={addMember} className="rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white active:bg-blue-700">＋ メンバー追加</button>
              <button onClick={importStaff} className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-bold text-slate-600 active:bg-slate-100">施術スタッフを取込</button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">区分「施術」は色チップ表示。受付・学生は時間帯を出します。既定の出勤時間を入れておくと、日の編集時に自動で入ります。</p>
          </div>
        )}
      </div>

      {/* 日の編集モーダル */}
      {edit && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">
                {(() => { const d = new Date(edit + "T00:00:00"); return `${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）のシフト`; })()}
              </h2>
              <button onClick={() => setEdit(null)} className="text-slate-400">✕</button>
            </div>
            <div className="space-y-1.5">
              {activeMembers.map((m) => {
                const dr = draft[m.id] ?? { on: false, start: "", end: "", clinic: false };
                return (
                  <div key={m.id} className={`rounded-lg border p-2 ${dr.on ? "border-slate-300 bg-slate-50" : "border-slate-100"}`}>
                    <div className="flex items-center gap-2">
                      <label className="flex flex-1 items-center gap-2">
                        <input type="checkbox" checked={dr.on} onChange={(e) => setDraft((p) => ({ ...p, [m.id]: { ...dr, on: e.target.checked } }))} className="h-4 w-4" />
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                        <span className="text-sm font-bold text-slate-800">{m.name || "（無名）"}</span>
                        <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-400">{ROLE_LABEL[m.role]}</span>
                      </label>
                    </div>
                    {dr.on && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-6">
                        <span className="text-[11px] text-slate-400">時間</span>
                        <input type="time" value={dr.start} onChange={(e) => setDraft((p) => ({ ...p, [m.id]: { ...dr, start: e.target.value } }))} className="rounded border border-slate-300 px-1 py-1 text-[12px]" />
                        <span className="text-slate-400">-</span>
                        <input type="time" value={dr.end} onChange={(e) => setDraft((p) => ({ ...p, [m.id]: { ...dr, end: e.target.value } }))} className="rounded border border-slate-300 px-1 py-1 text-[12px]" />
                        {m.role === "therapist" && (
                          <label className="ml-1 flex items-center gap-1 text-[12px] text-slate-600">
                            <input type="checkbox" checked={dr.clinic} onChange={(e) => setDraft((p) => ({ ...p, [m.id]: { ...dr, clinic: e.target.checked } }))} className="h-3.5 w-3.5" />
                            川西院
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {activeMembers.length === 0 && <p className="py-4 text-center text-sm text-slate-400">先に「メンバー設定」から追加してください。</p>}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <p className="text-[11px] text-slate-400">施術は時間を空欄にすると「終日」。受付・学生は時間帯を入力。</p>
              <button onClick={saveDay} className="ml-auto rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white active:bg-blue-700">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
