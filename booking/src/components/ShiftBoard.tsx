"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { loadAllStaff, loadBusinessHours } from "@/lib/data";
import { toDateStr } from "@/lib/booking";
import type { BusinessHours, Closure } from "@/lib/types";

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

type Seg = "all" | "am" | "pm";
type Draft = Record<string, { on: boolean; seg: Seg; start: string; end: string; clinic: boolean }>;
type Clip = { member_id: string; role: Member["role"]; seg: Seg; start_min: number | null; end_min: number | null; clinic: string | null };

export default function ShiftBoard() {
  const supabase = useMemo(() => createClient(), []);
  const [members, setMembers] = useState<Member[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [bh, setBh] = useState<BusinessHours[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [staffNames, setStaffNames] = useState<Map<string, string>>(new Map());
  const [date, setDate] = useState(() => toDateStr(new Date()));
  const [loading, setLoading] = useState(true);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [edit, setEdit] = useState<string | null>(null); // 編集中の日付
  const [draft, setDraft] = useState<Draft>({});
  const [dayClosure, setDayClosure] = useState<"none" | "full" | "am" | "pm">("none");
  const [clip, setClip] = useState<Clip[] | null>(null); // コピー中のシフト（貼り付けモード）

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
  useEffect(() => {
    loadMembers();
    loadBusinessHours(supabase).then(setBh).catch(() => {});
    loadAllStaff(supabase).then((st) => setStaffNames(new Map(st.map((s) => [s.id, s.name])))).catch(() => {});
  }, [loadMembers, supabase]);

  const reload = useCallback(async () => {
    setLoading(true);
    const [{ data: sh }, { data: cl }] = await Promise.all([
      supabase.from("shifts").select("id, date, member_id, start_min, end_min, clinic, note").gte("date", monthStart).lt("date", monthEnd),
      supabase.from("closures").select("id, date, staff_id, service_id, start_min, end_min, reason").gte("date", monthStart).lt("date", monthEnd),
    ]);
    setShifts((sh as Shift[]) ?? []);
    setClosures((cl as Closure[]) ?? []);
    setLoading(false);
  }, [supabase, monthStart, monthEnd]);
  useEffect(() => { reload(); }, [reload]);

  // 曜日別の営業（休診曜日の判定）と営業時間の基本形
  const bhByWd = useMemo(() => new Map(bh.map((b) => [b.weekday, b])), [bh]);
  // 院全体の休診（終日/時間帯）を日付別に
  const closuresByDate = useMemo(() => {
    const m = new Map<string, Closure[]>();
    closures.filter((c) => c.staff_id == null && c.service_id == null).forEach((c) => { const a = m.get(c.date) ?? []; a.push(c); m.set(c.date, a); });
    return m;
  }, [closures]);
  // 営業時間の基本形（その日の出勤時間の既定に使う）
  const bhSpan = useCallback((ds: string) => {
    const wd = new Date(ds + "T00:00:00").getDay();
    const b = bhByWd.get(wd);
    if (!b || !b.is_open) return { start: null as number | null, end: null as number | null };
    return { start: b.seg1_start ?? b.seg2_start ?? null, end: b.seg2_end ?? b.seg1_end ?? null };
  }, [bhByWd]);
  const closureLabel = (c: Closure) => {
    if (c.start_min == null) return "休診";
    if (c.end_min != null && c.end_min <= 810) return "午前休診";
    if (c.start_min >= 780) return "午後休診";
    return "休診";
  };
  const indivLabel = (c: Closure) => {
    if (c.start_min == null) return "休";
    if (c.end_min != null && c.end_min <= 810) return "午前休";
    if (c.start_min >= 780) return "午後休";
    return "休";
  };
  const memberByName = useMemo(() => new Map(members.map((m) => [m.name, m])), [members]);
  // スタッフ個別の休み（担当限定の休診）を日付→メンバー別に
  const indivByDate = useMemo(() => {
    const m = new Map<string, { member: Member; label: string }[]>();
    closures.filter((c) => c.staff_id != null && c.service_id == null).forEach((c) => {
      const name = staffNames.get(c.staff_id as string);
      if (!name) return;
      const mem = memberByName.get(name);
      if (!mem) return;
      const a = m.get(c.date) ?? [];
      a.push({ member: mem, label: indivLabel(c) });
      m.set(c.date, a);
    });
    return m;
  }, [closures, staffNames, memberByName]);

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
    const last = new Date(y, m, 0).getDate();
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) cells.push(new Date(y, m - 1, 1 - first.getDay() + i));
    const rows: Date[][] = [];
    for (let i = 0; i < 42; i += 7) {
      const wk = cells.slice(i, i + 7);
      if (wk.some((d) => d.getMonth() === m - 1)) rows.push(wk);
      if (wk[6].getMonth() === m - 1 && wk[6].getDate() === last) break;
      if (wk[0].getMonth() === m - 1 && wk[0].getDate() > last) break;
    }
    return rows;
  }, [date]);

  // その日・そのメンバーが午前/午後どちらに出るか
  const covFor = (ds: string, dow: number, memberId: string, s: Shift) => {
    const split = bhByWd.get(dow)?.seg1_end ?? 780;
    let am = s.start_min == null ? true : s.start_min < split;
    let pm = s.start_min == null ? true : s.end_min == null || s.end_min > split;
    (closuresByDate.get(ds) ?? []).forEach((c) => { if (c.start_min != null) { const l = closureLabel(c); if (l === "午前休診") am = false; if (l === "午後休診") pm = false; } });
    (indivByDate.get(ds) ?? []).filter((x) => x.member.id === memberId).forEach((x) => { if (x.label === "午前休") am = false; if (x.label === "午後休") pm = false; });
    return { am, pm };
  };

  const gotoMonth = (dir: number) => {
    const [y, m] = date.split("-").map(Number);
    const nm = m + dir; const ny = nm < 1 ? y - 1 : nm > 12 ? y + 1 : y; const mm = ((nm - 1 + 12) % 12) + 1;
    setDate(`${ny}-${pad(mm)}-01`);
  };

  // 区分（終日/午前/午後）→ その日の営業時間の時間帯
  const segTimes = (ds: string, seg: Seg): { start: number | null; end: number | null } => {
    const b = bhByWd.get(new Date(ds + "T00:00:00").getDay());
    if (seg === "am") return { start: b?.seg1_start ?? 600, end: b?.seg1_end ?? 780 };
    if (seg === "pm") return { start: b?.seg2_start ?? 960, end: b?.seg2_end ?? 1230 };
    return { start: null, end: null };
  };
  function openDay(ds: string) {
    const day = shiftsByDate.get(ds) ?? [];
    const span = bhSpan(ds); // 営業時間ベースの既定
    const split = bhByWd.get(new Date(ds + "T00:00:00").getDay())?.seg1_end ?? 780;
    const d: Draft = {};
    activeMembers.forEach((m) => {
      const sh = day.find((x) => x.member_id === m.id);
      const isT = m.role === "therapist";
      // 施術は終日/午前/午後の区分。受付・学生は時間帯。
      let seg: Seg = "all";
      if (isT && sh && sh.start_min != null) seg = sh.end_min != null && sh.end_min <= split ? "am" : "pm";
      const defStart = isT ? null : m.default_start != null ? m.default_start : span.start;
      const defEnd = isT ? null : m.default_end != null ? m.default_end : span.end;
      d[m.id] = {
        on: !!sh,
        seg,
        start: !isT && sh?.start_min != null ? minToTime(sh.start_min) : defStart != null ? minToTime(defStart) : "",
        end: !isT && sh?.end_min != null ? minToTime(sh.end_min) : defEnd != null ? minToTime(defEnd) : "",
        clinic: sh?.clinic === "kawanishi",
      };
    });
    // 院全体の休診状態を反映
    const cls = closuresByDate.get(ds) ?? [];
    setDayClosure(cls.some((c) => c.start_min == null) ? "full" : cls.some((c) => closureLabel(c) === "午前休診") ? "am" : cls.some((c) => closureLabel(c) === "午後休診") ? "pm" : "none");
    setDraft(d); setEdit(ds);
  }
  function draftRows(ds: string) {
    return activeMembers.filter((m) => draft[m.id]?.on).map((m) => {
      const isT = m.role === "therapist";
      const t = isT ? segTimes(ds, draft[m.id].seg) : { start: draft[m.id].start ? timeToMin(draft[m.id].start) : null, end: draft[m.id].end ? timeToMin(draft[m.id].end) : null };
      return { date: ds, member_id: m.id, start_min: t.start, end_min: t.end, clinic: draft[m.id].clinic ? "kawanishi" : null };
    });
  }
  async function saveDay() {
    if (!edit) return;
    await supabase.from("shifts").delete().eq("date", edit);
    const rows = draftRows(edit);
    if (rows.length) await supabase.from("shifts").insert(rows);
    // 院全体の休診（予約側の closures と共通）
    await supabase.from("closures").delete().eq("date", edit).is("staff_id", null).is("service_id", null);
    if (dayClosure !== "none") {
      const t = dayClosure === "full" ? { start: null, end: null } : segTimes(edit, dayClosure);
      await supabase.from("closures").insert({ date: edit, staff_id: null, service_id: null, start_min: t.start, end_min: t.end, reason: null });
    }
    setEdit(null); reload();
  }
  // この日のシフトをコピー（貼り付けモードへ）
  function copyDay() {
    if (!edit) return;
    const rows: Clip[] = activeMembers.filter((m) => draft[m.id]?.on).map((m) => {
      const isT = m.role === "therapist";
      return {
        member_id: m.id, role: m.role, seg: isT ? draft[m.id].seg : "all",
        start_min: isT ? null : draft[m.id].start ? timeToMin(draft[m.id].start) : null,
        end_min: isT ? null : draft[m.id].end ? timeToMin(draft[m.id].end) : null,
        clinic: draft[m.id].clinic ? "kawanishi" : null,
      };
    });
    setClip(rows); setEdit(null);
  }
  async function pasteTo(ds: string) {
    if (!clip) return;
    await supabase.from("shifts").delete().eq("date", ds);
    const rows = clip.map((c) => {
      const t = c.role === "therapist" ? segTimes(ds, c.seg) : { start: c.start_min, end: c.end_min };
      return { date: ds, member_id: c.member_id, start_min: t.start, end_min: t.end, clinic: c.clinic };
    });
    if (rows.length) await supabase.from("shifts").insert(rows);
    reload();
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

      {clip && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
          <span className="font-bold text-amber-800">📋 貼り付けモード：日をタップで貼り付け（{clip.length}人分）</span>
          <button onClick={() => setClip(null)} className="ml-auto rounded bg-amber-600 px-2 py-1 text-[11px] font-bold text-white active:bg-amber-700">終了</button>
        </div>
      )}

      {/* カレンダー（月グリッド） */}
      <div className="overflow-hidden rounded-xl border bg-white">
        <div>
          <div className="grid grid-cols-7 border-b bg-slate-50 text-center text-[10px] font-bold">
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
                  const dow = d.getDay();
                  const day = (shiftsByDate.get(ds) ?? []).map((s) => ({ s, m: memberById.get(s.member_id) })).filter((x) => x.m) as { s: Shift; m: Member }[];
                  day.sort((a, b) => ROLE_ORDER[a.m.role] - ROLE_ORDER[b.m.role] || a.m.sort_order - b.m.sort_order);
                  const dayCl = closuresByDate.get(ds) ?? [];
                  const fullClosed = dayCl.some((c) => c.start_min == null);
                  const wdClosed = bhByWd.get(dow)?.is_open === false;
                  const closed = inMonth && (wdClosed || fullClosed);
                  const reason = (dayCl.find((c) => c.start_min == null)?.reason ?? "").trim();
                  const workingIds = new Set(day.map((x) => x.m.id));
                  const offMembers = (indivByDate.get(ds) ?? []).filter((x) => !workingIds.has(x.member.id));
                  // 各出勤者を「終日／午前のみ→午後休診／午後のみ→午前休診」に振り分け
                  const full: { s: Shift; m: Member }[] = [];
                  const partial: { s: Shift; m: Member; label: string }[] = [];
                  const parttime: { s: Shift; m: Member }[] = [];
                  day.forEach((it) => {
                    if (it.m.role !== "therapist") { parttime.push(it); return; }
                    const { am, pm } = covFor(ds, dow, it.m.id, it.s);
                    if (am && pm) full.push(it);
                    else if (am && !pm) partial.push({ ...it, label: "午後休診" });
                    else if (!am && pm) partial.push({ ...it, label: "午前休診" });
                  });
                  // 段分け：施術スタッフ／受付／学生（＋その他）を別々の行で表示
                  const reception = parttime.filter((x) => x.m.role === "reception");
                  const student = parttime.filter((x) => x.m.role === "student");
                  const other = parttime.filter((x) => x.m.role === "other");
                  const offTher = offMembers.filter((x) => x.member.role === "therapist");
                  const offRec = offMembers.filter((x) => x.member.role === "reception");
                  const offStu = offMembers.filter((x) => x.member.role === "student");
                  const hasTher = partial.length > 0 || full.length > 0 || offTher.length > 0;
                  const today = ds === toDateStr(new Date());
                  return (
                    <button key={ds} onClick={() => inMonth && (clip ? pasteTo(ds) : openDay(ds))} disabled={!inMonth}
                      className={`flex min-h-[92px] flex-col border-b border-r text-left ${!inMonth ? "bg-slate-50/50" : clip ? "active:bg-amber-100" : "active:bg-blue-50"}`}>
                      {/* 日付バンド */}
                      <div className={`flex items-center justify-between border-b px-1 py-0.5 ${!inMonth ? "bg-slate-100/60" : "bg-[#fbf5df]"}`}>
                        <span className={`text-[11px] font-bold ${!inMonth ? "text-slate-300" : dow === 0 ? "text-rose-500" : dow === 6 ? "text-blue-500" : "text-slate-700"}`}>{d.getDate()}</span>
                        {inMonth && reason && <span className="truncate text-[8px] font-bold text-rose-500">{reason}</span>}
                        {inMonth && today && !reason && <span className="rounded bg-blue-600 px-0.5 text-[8px] font-bold text-white">今日</span>}
                      </div>
                      {/* 内容：施術スタッフ／受付／学生 の3段 */}
                      <div className={`flex flex-1 flex-col justify-center gap-0.5 px-0.5 py-1 ${closed ? "bg-slate-100" : ""}`}>
                        {!inMonth ? null : closed ? (
                          <span className="text-center text-xs font-bold tracking-[0.2em] text-rose-500">休診</span>
                        ) : (
                          <>
                            {/* ① 施術スタッフ */}
                            {hasTher && (
                              <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5">
                                {partial.map(({ s, m, label }) => (
                                  <span key={"p" + s.id} className="inline-flex flex-col items-center border-r border-dashed border-slate-400 pr-1">
                                    <span className="text-[10px] font-bold leading-tight" style={{ color: m.color }}>{m.name}{s.clinic === "kawanishi" ? "(川西)" : ""}</span>
                                    <span className="mt-0.5 bg-slate-300 px-0.5 text-[8px] font-bold text-rose-600">{label}</span>
                                  </span>
                                ))}
                                {full.map(({ s, m }) => (
                                  <span key={s.id} className="text-[10px] font-bold leading-tight" style={{ color: m.color }}>{m.name}{s.clinic === "kawanishi" ? "(川西)" : ""}</span>
                                ))}
                                {offTher.map((x, i) => (
                                  <span key={"ot" + i} className="text-[9px] font-bold text-rose-400 line-through decoration-rose-300">{x.member.name} {x.label}</span>
                                ))}
                              </div>
                            )}
                            {/* ② 受付 */}
                            {(reception.length > 0 || offRec.length > 0) && (
                              <div className={`flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 ${hasTher ? "border-t border-slate-100 pt-0.5" : ""}`}>
                                {reception.map(({ s, m }) => (
                                  <span key={"r" + s.id} className="text-[10px] font-bold leading-tight" style={{ color: m.color }}>{m.name} {range(s.start_min, s.end_min)}</span>
                                ))}
                                {offRec.map((x, i) => (
                                  <span key={"or" + i} className="text-[9px] font-bold text-rose-400 line-through decoration-rose-300">{x.member.name} {x.label}</span>
                                ))}
                              </div>
                            )}
                            {/* ③ 学生 */}
                            {(student.length > 0 || offStu.length > 0) && (
                              <div className={`flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 ${hasTher || reception.length > 0 || offRec.length > 0 ? "border-t border-slate-100 pt-0.5" : ""}`}>
                                {student.map(({ s, m }) => (
                                  <span key={"s" + s.id} className="text-[10px] font-bold leading-tight" style={{ color: m.color }}>{m.name} {range(s.start_min, s.end_min)}</span>
                                ))}
                                {offStu.map((x, i) => (
                                  <span key={"os" + i} className="text-[9px] font-bold text-rose-400 line-through decoration-rose-300">{x.member.name} {x.label}</span>
                                ))}
                              </div>
                            )}
                            {/* その他 */}
                            {other.length > 0 && (
                              <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 border-t border-slate-100 pt-0.5">
                                {other.map(({ s, m }) => (
                                  <span key={"x" + s.id} className="text-[10px] font-bold leading-tight" style={{ color: m.color }}>{m.name} {range(s.start_min, s.end_min)}</span>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-400">日をタップして編集。上から<b>施術スタッフ</b>／<b>受付</b>／<b>学生</b>の3段で表示（受付・学生は時間帯付き）。午前/午後だけの人は名前＋灰色の「午前休診/午後休診」。休診日はグレー。</p>

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
                        {m.role === "therapist" ? (
                          <span className="text-[11px] text-slate-300">終日（時間不要）</span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <input type="time" value={m.default_start != null ? minToTime(m.default_start) : ""} onChange={(e) => setMemberLocal(m.id, { default_start: e.target.value ? timeToMin(e.target.value) : null })} onBlur={() => persistMember(m.id)} className="rounded border border-slate-300 px-1 py-1 text-[12px]" />
                            <span className="text-slate-400">-</span>
                            <input type="time" value={m.default_end != null ? minToTime(m.default_end) : ""} onChange={(e) => setMemberLocal(m.id, { default_end: e.target.value ? timeToMin(e.target.value) : null })} onBlur={() => persistMember(m.id)} className="rounded border border-slate-300 px-1 py-1 text-[12px]" />
                          </div>
                        )}
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
            {/* 休診（この日を院全体で休みに） */}
            <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 p-2">
              <span className="mr-1 text-[12px] font-bold text-slate-600">休診</span>
              {(["none", "full", "am", "pm"] as const).map((v) => (
                <button key={v} onClick={() => setDayClosure(v)}
                  className={`rounded border px-2 py-1 text-[11px] font-bold ${dayClosure === v ? "border-rose-500 bg-rose-500 text-white" : "border-slate-300 text-slate-600"}`}>
                  {v === "none" ? "通常" : v === "full" ? "終日休診" : v === "am" ? "午前休診" : "午後休診"}
                </button>
              ))}
            </div>
            <div className={`space-y-1.5 ${dayClosure === "full" ? "opacity-40" : ""}`}>
              {activeMembers.map((m) => {
                const dr = draft[m.id] ?? { on: false, seg: "all" as Seg, start: "", end: "", clinic: false };
                return (
                  <div key={m.id} className={`rounded-lg border p-2 ${dr.on ? "border-slate-300 bg-slate-50" : "border-slate-100"}`}>
                    <div className="flex items-center gap-2">
                      <label className="flex flex-1 items-center gap-2">
                        <input type="checkbox" checked={dr.on} onChange={(e) => setDraft((p) => ({ ...p, [m.id]: { ...dr, on: e.target.checked } }))} className="h-4 w-4" />
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                        <span className="text-sm font-bold text-slate-800">{m.name || "（無名）"}</span>
                        <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-400">{ROLE_LABEL[m.role]}</span>
                        {(indivByDate.get(edit) ?? []).some((x) => x.member.id === m.id) && (
                          <span className="rounded bg-rose-50 px-1 text-[10px] font-bold text-rose-500">お休み登録あり</span>
                        )}
                      </label>
                    </div>
                    {dr.on && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-6">
                        {m.role === "therapist" ? (
                          <>
                            {(["all", "am", "pm"] as const).map((sg) => (
                              <button key={sg} onClick={() => setDraft((p) => ({ ...p, [m.id]: { ...dr, seg: sg } }))}
                                className={`rounded border px-2 py-1 text-[11px] font-bold ${dr.seg === sg ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-600"}`}>
                                {sg === "all" ? "終日" : sg === "am" ? "午前のみ" : "午後のみ"}
                              </button>
                            ))}
                            <label className="ml-1 flex items-center gap-1 text-[12px] text-slate-600">
                              <input type="checkbox" checked={dr.clinic} onChange={(e) => setDraft((p) => ({ ...p, [m.id]: { ...dr, clinic: e.target.checked } }))} className="h-3.5 w-3.5" />
                              川西院
                            </label>
                          </>
                        ) : (
                          <>
                            <span className="text-[11px] text-slate-400">時間</span>
                            <input type="time" value={dr.start} onChange={(e) => setDraft((p) => ({ ...p, [m.id]: { ...dr, start: e.target.value } }))} className="rounded border border-slate-300 px-1 py-1 text-[12px]" />
                            <span className="text-slate-400">-</span>
                            <input type="time" value={dr.end} onChange={(e) => setDraft((p) => ({ ...p, [m.id]: { ...dr, end: e.target.value } }))} className="rounded border border-slate-300 px-1 py-1 text-[12px]" />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {activeMembers.length === 0 && <p className="py-4 text-center text-sm text-slate-400">先に「メンバー設定」から追加してください。</p>}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button onClick={copyDay} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-600 active:bg-slate-100">📋 この日をコピー</button>
              <button onClick={saveDay} className="ml-auto rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white active:bg-blue-700">保存</button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">施術＝終日/午前のみ/午後のみ。受付・学生＝時間帯。「コピー」後に他の日をタップすると同じ内容を貼り付けます。</p>
          </div>
        </div>
      )}
    </div>
  );
}
