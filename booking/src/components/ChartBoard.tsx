"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadAllStaff } from "@/lib/data";
import { minToLabel, toDateStr, WEEKDAY_LABELS } from "@/lib/booking";
import { ageAt } from "@/lib/pricing";
import type { Staff } from "@/lib/types";

const normName = (s: string | null | undefined) => (s || "").replace(/[\s　]/g, "").trim();
const TEAL = "#0d9488";

type ApptRow = {
  id: string;
  patient_id: string | null;
  patient_name: string | null;
  date: string;
  start_min: number;
  end_min: number;
  status: string;
  service_id: string | null;
  service_name: string | null;
  staff_id: string | null;
};
type PatRow = {
  id: string;
  name: string;
  name_kana: string | null;
  birth_date: string | null;
  phone: string | null;
  chart_note: string | null;
};
type Person = {
  key: string;
  patient_id: string | null;
  name: string;
  name_kana: string | null;
  birth_date: string | null;
  phone: string | null;
  chart_note: string | null;
  visits: ApptRow[]; // 新しい順
  lastVisit: string | null;
  visitCount: number; // 当日以前の来院回数
  hasToday: boolean;
  hasFuture: boolean;
};
type MarkType = "pain" | "stiff" | "numb" | "treat";
type Mark = { id: string; side: "front" | "back"; x: number; y: number; type: MarkType };
const MARKS: { key: MarkType; label: string; color: string }[] = [
  { key: "pain", label: "痛み", color: "#ef4444" },
  { key: "stiff", label: "こり", color: "#3b82f6" },
  { key: "numb", label: "しびれ", color: "#22c55e" },
  { key: "treat", label: "治療ポイント", color: "#0d9488" },
];
const markColor = (t: MarkType) => MARKS.find((m) => m.key === t)?.color ?? "#64748b";

type ChartFields = {
  complaint: string;
  findings: string;
  treatment: string;
  progress: string;
  note: string;
  body_marks: Mark[];
};
const EMPTY: ChartFields = { complaint: "", findings: "", treatment: "", progress: "", note: "", body_marks: [] };

export default function ChartBoard() {
  const supabase = useMemo(() => createClient(), []);
  const today = toDateStr(new Date());

  const [staff, setStaff] = useState<Staff[]>([]);
  const [appts, setAppts] = useState<ApptRow[]>([]);
  const [pats, setPats] = useState<PatRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "visiting" | "booked" | "repeat">("all");
  const [selKey, setSelKey] = useState<string | null>(null);
  const [tab, setTab] = useState<"chart" | "records" | "history">("chart");

  // 選択患者の明細
  const [chartMap, setChartMap] = useState<Record<string, ChartFields & { is_draft?: boolean }>>({});
  const [referrer, setReferrer] = useState<string | null>(null);
  const [selVisitId, setSelVisitId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ChartFields>(EMPTY);
  const [patNote, setPatNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);

  const staffName = useCallback((id: string | null) => staff.find((s) => s.id === id)?.name ?? "", [staff]);

  // 全件取得（1000件上限を超えるぶんはページングで集める）
  const fetchAllAppts = useCallback(async () => {
    const PAGE = 1000;
    const out: ApptRow[] = [];
    for (let i = 0; i < 20; i++) {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, patient_id, patient_name, date, start_min, end_min, status, service_id, service_name, staff_id")
        .neq("status", "cancelled")
        .order("date", { ascending: false })
        .range(i * PAGE, i * PAGE + PAGE - 1);
      if (error || !data || data.length === 0) break;
      out.push(...(data as ApptRow[]));
      if (data.length < PAGE) break;
    }
    return out;
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    const [st, ap, { data: pd }] = await Promise.all([
      loadAllStaff(supabase),
      fetchAllAppts(),
      supabase.from("patients").select("id, name, name_kana, birth_date, phone, chart_note").order("name"),
    ]);
    setStaff(st);
    setAppts(ap);
    setPats((pd as PatRow[]) ?? []);
    setLoading(false);
  }, [supabase, fetchAllAppts]);

  useEffect(() => { load(); }, [load]);

  // 患者（予約の氏名＋患者台帳）を1人にまとめる
  const persons = useMemo<Person[]>(() => {
    const map = new Map<string, Person>();
    const keyFor = (pid: string | null, name: string | null) => pid || "name:" + normName(name);
    for (const p of pats) {
      map.set(p.id, {
        key: p.id, patient_id: p.id, name: p.name, name_kana: p.name_kana, birth_date: p.birth_date,
        phone: p.phone, chart_note: p.chart_note, visits: [], lastVisit: null, visitCount: 0, hasToday: false, hasFuture: false,
      });
    }
    for (const a of appts) {
      const key = keyFor(a.patient_id, a.patient_name);
      let person = map.get(key);
      if (!person) {
        person = {
          key, patient_id: a.patient_id, name: a.patient_name || "（未登録）", name_kana: null, birth_date: null,
          phone: null, chart_note: null, visits: [], lastVisit: null, visitCount: 0, hasToday: false, hasFuture: false,
        };
        map.set(key, person);
      }
      person.visits.push(a);
    }
    const arr: Person[] = [];
    for (const p of map.values()) {
      const vs = [...p.visits].sort((x, y) => y.date.localeCompare(x.date) || y.start_min - x.start_min);
      const pastOrToday = vs.filter((v) => v.date <= today);
      p.visits = vs;
      p.lastVisit = pastOrToday[0]?.date ?? null;
      p.visitCount = pastOrToday.length;
      p.hasToday = vs.some((v) => v.date === today);
      p.hasFuture = vs.some((v) => v.date > today);
      arr.push(p);
    }
    // 最終来院が新しい順（未来院は下）
    arr.sort((a, b) => (b.lastVisit || "").localeCompare(a.lastVisit || "") || a.name.localeCompare(b.name, "ja"));
    return arr;
  }, [appts, pats, today]);

  const shown = useMemo(() => {
    const key = normName(q);
    return persons.filter((p) => {
      if (filter === "visiting" && !p.hasToday) return false;
      if (filter === "booked" && !p.hasFuture) return false;
      if (filter === "repeat" && p.visitCount < 2) return false;
      if (!key) return true;
      return (
        normName(p.name).includes(key) ||
        normName(p.name_kana).includes(key) ||
        (p.phone || "").replace(/[^0-9]/g, "").includes(q.replace(/[^0-9]/g, "")) && !!q.replace(/[^0-9]/g, "")
      );
    });
  }, [persons, q, filter]);

  const selected = useMemo(() => persons.find((p) => p.key === selKey) ?? null, [persons, selKey]);

  // 患者を選んだら：カルテ記録・紹介元・メモを読み込み、本日（なければ直近）の来院を選択
  const openPerson = useCallback(async (p: Person) => {
    setSelKey(p.key);
    setTab("chart");
    setMsg(null);
    setPatNote(p.chart_note ?? "");
    // 本日 or 直近（当日以前）の来院を既定選択
    const todayVisit = p.visits.find((v) => v.date === today);
    const lastPast = p.visits.find((v) => v.date <= today);
    const pick = todayVisit ?? lastPast ?? p.visits[0] ?? null;
    setSelVisitId(pick?.id ?? null);
    setDraft(EMPTY);
    setChartMap({});
    setReferrer(null);

    const apptIds = p.visits.map((v) => v.id);
    // カルテ記録（列未マイグレーションでも落ちないよう段階的に）
    const cm: Record<string, ChartFields & { is_draft?: boolean }> = {};
    if (apptIds.length) {
      let rows: Record<string, unknown>[] | null = null;
      const full = await supabase
        .from("chart_entries")
        .select("appointment_id, complaint, findings, progress, treatment, note, body_marks, is_draft")
        .in("appointment_id", apptIds);
      if (full.error) {
        const base = await supabase
          .from("chart_entries")
          .select("appointment_id, complaint, findings, progress, treatment, note")
          .in("appointment_id", apptIds);
        rows = (base.data as Record<string, unknown>[] | null) ?? [];
      } else {
        rows = (full.data as Record<string, unknown>[] | null) ?? [];
      }
      rows.forEach((r) => {
        const bm = r.body_marks;
        cm[r.appointment_id as string] = {
          complaint: (r.complaint as string) ?? "",
          findings: (r.findings as string) ?? "",
          progress: (r.progress as string) ?? "",
          treatment: (r.treatment as string) ?? "",
          note: (r.note as string) ?? "",
          body_marks: Array.isArray(bm) ? (bm as Mark[]) : (typeof bm === "string" && bm ? (JSON.parse(bm) as Mark[]) : []),
          is_draft: (r.is_draft as boolean) ?? false,
        };
      });
    }
    setChartMap(cm);
    if (pick) setDraft(cm[pick.id] ?? EMPTY);

    // 紹介元（新患名簿の紹介者を氏名でリンク）
    try {
      const { data: np } = await supabase.from("new_patients").select("name, referrer, date").order("date", { ascending: false }).limit(3000);
      const key = normName(p.name);
      const hit = ((np as { name: string; referrer: string | null }[] | null) ?? []).find((r) => normName(r.name) === key && (r.referrer || "").trim());
      setReferrer(hit?.referrer?.trim() || null);
    } catch { setReferrer(null); }
  }, [supabase, today]);

  // 来院履歴の行をクリック → その来院のカルテを編集対象に
  function pickVisit(v: ApptRow) {
    setSelVisitId(v.id);
    setDraft(chartMap[v.id] ?? EMPTY);
    setTab("chart");
    setMsg(null);
  }

  const selVisit = useMemo(() => selected?.visits.find((v) => v.id === selVisitId) ?? null, [selected, selVisitId]);

  async function saveChart(isDraft: boolean) {
    if (!selected || !selVisit) return;
    setSaving(true);
    setMsg(null);
    const base = {
      appointment_id: selVisit.id,
      patient_id: selected.patient_id,
      staff_id: selVisit.staff_id,
      date: selVisit.date,
      complaint: draft.complaint.trim() || null,
      findings: draft.findings.trim() || null,
      progress: draft.progress.trim() || null,
      treatment: draft.treatment.trim() || null,
      note: draft.note.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const full = { ...base, body_marks: draft.body_marks, is_draft: isDraft };
    let { error } = await supabase.from("chart_entries").upsert(full, { onConflict: "appointment_id" });
    if (error) {
      // body_marks / is_draft 未マイグレーション時は外して保存
      ({ error } = await supabase.from("chart_entries").upsert(base, { onConflict: "appointment_id" }));
      if (!error) setMsg("保存しました（※身体図・下書きは列追加が必要です）");
    }
    setSaving(false);
    if (!error) {
      setChartMap((m) => ({ ...m, [selVisit.id]: { ...draft, is_draft: isDraft } }));
      if (!msg) setMsg(isDraft ? "下書き保存しました" : "保存しました");
    } else {
      setMsg("保存に失敗しました");
    }
  }

  async function savePatNote() {
    if (!selected?.patient_id) return;
    await supabase.from("patients").update({ chart_note: patNote.trim() || null }).eq("id", selected.patient_id);
    setMsg("メモを保存しました");
  }

  const statusBadge = (p: Person) =>
    p.hasToday ? { t: "来院中", c: "bg-teal-100 text-teal-700" }
    : p.hasFuture ? { t: "予約あり", c: "bg-blue-100 text-blue-700" }
    : p.visitCount >= 2 ? { t: "再来", c: "bg-slate-100 text-slate-500" }
    : { t: "初診", c: "bg-amber-100 text-amber-700" };

  const chartField = (label: string, key: "complaint" | "findings" | "treatment" | "progress" | "note", rows = 2) => (
    <div className="flex gap-3">
      <label className="mt-1 w-20 shrink-0 text-sm font-bold text-slate-600">{label}</label>
      <textarea
        value={draft[key]}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        rows={rows}
        className="min-h-0 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
      />
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-110px)] gap-3">
      {/* ── 左：患者一覧 ── */}
      <aside className="flex w-72 shrink-0 flex-col rounded-xl border bg-white">
        <div className="flex items-center justify-between gap-2 border-b p-3">
          <h2 className="text-base font-bold text-slate-800">患者一覧</h2>
          <button onClick={() => setAddOpen(true)} className="rounded-lg bg-teal-600 px-2.5 py-1.5 text-xs font-bold text-white active:bg-teal-700">＋ 新規登録</button>
        </div>
        <div className="p-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="患者名・かな・電話番号で検索"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
          />
        </div>
        <div className="flex gap-1 px-2 pb-2 text-xs font-bold">
          {([["all", "すべて"], ["visiting", "来院中"], ["booked", "予約あり"], ["repeat", "再来"]] as const).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`flex-1 rounded-md px-1 py-1.5 ${filter === k ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-500"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="py-10 text-center text-sm text-slate-400">読み込み中…</p>
          ) : shown.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">該当なし</p>
          ) : (
            shown.map((p) => {
              const b = statusBadge(p);
              const age = ageAt(p.birth_date, today);
              const active = p.key === selKey;
              return (
                <button
                  key={p.key}
                  onClick={() => openPerson(p)}
                  className={`flex w-full items-center gap-2 border-b px-3 py-2.5 text-left ${active ? "bg-teal-50" : "active:bg-slate-50"}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-slate-800">{p.name}</span>
                      {age != null && <span className="shrink-0 text-xs text-slate-400">{age}歳</span>}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">最終来院 {p.lastVisit ? p.lastVisit.replace(/-/g, "/") : "—"}</div>
                  </div>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${b.c}`}>{b.t}</span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ── 右：カルテ本体 ── */}
      <main className="min-w-0 flex-1 overflow-y-auto rounded-xl border bg-white">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">左の一覧から患者を選んでください</div>
        ) : (
          <div className="p-4">
            {/* 患者ヘッダー */}
            <div className="mb-3 flex flex-wrap items-center gap-2 border-b pb-3">
              <h1 className="text-xl font-bold text-slate-800">{selected.name}</h1>
              {ageAt(selected.birth_date, today) != null && <span className="text-sm text-slate-500">{ageAt(selected.birth_date, today)}歳</span>}
              {(() => { const b = statusBadge(selected); return <span className={`rounded px-2 py-0.5 text-xs font-bold ${b.c}`}>{b.t}</span>; })()}
              {selected.phone && <span className="ml-auto text-xs text-slate-400">{selected.phone}</span>}
            </div>

            {/* サマリ */}
            <div className="mb-3 grid grid-cols-3 gap-2 text-center text-sm">
              {([["初診日", selected.visits.filter((v) => v.date <= today).slice(-1)[0]?.date?.replace(/-/g, "/") ?? "—"],
                 ["来院回数", `${selected.visitCount}回`],
                 ["紹介元", referrer || "—"]] as const).map(([l, v]) => (
                <div key={l} className="rounded-lg border bg-slate-50 px-2 py-1.5">
                  <div className="text-[10px] font-bold text-slate-400">{l}</div>
                  <div className="truncate text-sm font-bold text-slate-700">{v}</div>
                </div>
              ))}
            </div>

            {/* タブ */}
            <div className="mb-3 flex gap-4 border-b text-sm font-bold">
              {([["chart", "自費カルテ"], ["records", "施術記録"], ["history", "来院履歴"]] as const).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`-mb-px border-b-2 px-1 pb-2 ${tab === k ? "border-teal-600 text-teal-700" : "border-transparent text-slate-400"}`}
                >
                  {l}
                </button>
              ))}
            </div>

            {msg && <p className="mb-2 rounded-md bg-teal-50 px-3 py-1.5 text-sm font-bold text-teal-700">{msg}</p>}

            {/* ── 自費カルテ ── */}
            {tab === "chart" && (
              <>
                {!selVisit ? (
                  <p className="rounded-lg border bg-slate-50 py-6 text-center text-sm text-slate-400">来院記録がありません（来院履歴から選択）</p>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
                    {/* 記録フォーム */}
                    <div className="rounded-xl border p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-base font-bold text-slate-800">
                          {selVisit.date === today ? "本日の記録" : "来院の記録"}
                        </span>
                        <span className="text-xs text-slate-500">
                          {selVisit.date.replace(/-/g, "/")}（{WEEKDAY_LABELS[new Date(selVisit.date + "T00:00:00").getDay()]}）{minToLabel(selVisit.start_min)}–{minToLabel(selVisit.end_min)}　担当：{staffName(selVisit.staff_id) || "—"}
                          {chartMap[selVisit.id]?.is_draft && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700">下書き</span>}
                        </span>
                      </div>
                      <div className="space-y-2.5">
                        {chartField("主訴", "complaint")}
                        {chartField("評価", "findings")}
                        {chartField("施術内容", "treatment", 3)}
                        {chartField("施術後の変化", "progress")}
                      </div>
                      <div className="mt-4 flex items-center justify-end gap-2">
                        <button onClick={() => saveChart(true)} disabled={saving} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 active:bg-slate-100 disabled:opacity-50">下書き保存</button>
                        <button onClick={() => saveChart(false)} disabled={saving} className="rounded-lg bg-teal-600 px-6 py-2 text-sm font-bold text-white active:bg-teal-700 disabled:opacity-50">{saving ? "保存中…" : "保存"}</button>
                      </div>
                    </div>

                    {/* 右：部位メモ（準備中）＋メモ */}
                    <div className="space-y-3">
                      <div className="rounded-xl border p-3">
                        <div className="mb-2 text-sm font-bold text-slate-600">身体図（痛み・治療ポイント）</div>
                        <BodyMap value={draft.body_marks} onChange={(bm) => setDraft((d) => ({ ...d, body_marks: bm }))} />
                      </div>
                      <div className="rounded-xl border p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-bold text-slate-600">メモ（この来院）</span>
                        </div>
                        <textarea
                          value={draft.note}
                          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                          rows={4}
                          className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                        />
                      </div>
                      <div className="rounded-xl border p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-bold text-slate-600">患者メモ（共通）</span>
                          <button onClick={savePatNote} disabled={!selected.patient_id} className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-bold text-slate-500 active:bg-slate-100 disabled:opacity-40">保存</button>
                        </div>
                        <textarea
                          value={patNote}
                          onChange={(e) => setPatNote(e.target.value)}
                          rows={3}
                          placeholder={selected.patient_id ? "紹介・申し送り・注意点など" : "予約から登録された患者のみ保存できます"}
                          className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 来院履歴（下） */}
                <div className="mt-4 rounded-xl border p-3">
                  <div className="mb-2 text-base font-bold text-slate-800">来院履歴</div>
                  <VisitTable visits={selected.visits} chartMap={chartMap} today={today} staffName={staffName} onPick={pickVisit} selId={selVisitId} compact />
                </div>
              </>
            )}

            {/* ── 施術記録（カルテのある来院の一覧） ── */}
            {tab === "records" && (
              <div className="space-y-3">
                {selected.visits.filter((v) => chartMap[v.id]).length === 0 ? (
                  <p className="rounded-lg border bg-slate-50 py-6 text-center text-sm text-slate-400">カルテ記録はまだありません</p>
                ) : (
                  selected.visits.filter((v) => chartMap[v.id]).map((v) => {
                    const c = chartMap[v.id];
                    return (
                      <div key={v.id} className="rounded-xl border p-3">
                        <button onClick={() => pickVisit(v)} className="mb-2 flex w-full items-center justify-between text-left">
                          <span className="text-sm font-bold text-slate-700">
                            {v.date.replace(/-/g, "/")}　{minToLabel(v.start_min)}
                            {c.is_draft && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700">下書き</span>}
                          </span>
                          <span className="text-xs text-slate-400">担当：{staffName(v.staff_id) || "—"}　編集 ›</span>
                        </button>
                        <dl className="space-y-1 text-sm">
                          {([["主訴", c.complaint], ["評価", c.findings], ["施術内容", c.treatment], ["施術後の変化", c.progress], ["メモ", c.note]] as const)
                            .filter(([, val]) => (val || "").trim())
                            .map(([l, val]) => (
                              <div key={l} className="flex gap-2">
                                <dt className="w-20 shrink-0 font-bold text-slate-500">{l}</dt>
                                <dd className="min-w-0 whitespace-pre-wrap text-slate-700">{val}</dd>
                              </div>
                            ))}
                        </dl>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ── 来院履歴（全件） ── */}
            {tab === "history" && (
              <div className="rounded-xl border p-3">
                <VisitTable visits={selected.visits} chartMap={chartMap} today={today} staffName={staffName} onPick={pickVisit} selId={selVisitId} />
              </div>
            )}
          </div>
        )}
      </main>

      {addOpen && <AddPatientModal supabase={supabase} onClose={() => setAddOpen(false)} onAdded={async (id) => { setAddOpen(false); await load(); setSelKey(id); }} />}
    </div>
  );
}

// 来院履歴テーブル
function VisitTable({
  visits, chartMap, today, staffName, onPick, selId, compact,
}: {
  visits: ApptRow[];
  chartMap: Record<string, ChartFields & { is_draft?: boolean }>;
  today: string;
  staffName: (id: string | null) => string;
  onPick: (v: ApptRow) => void;
  selId: string | null;
  compact?: boolean;
}) {
  const rows = compact ? visits.filter((v) => v.date <= today).slice(0, 6) : visits;
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-slate-400">来院履歴はありません</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-slate-400">
            <th className="py-1.5 pr-2 font-bold">日付</th>
            <th className="py-1.5 pr-2 font-bold">施術内容（抜粋）</th>
            <th className="py-1.5 pr-2 font-bold">施術後の変化</th>
            <th className="py-1.5 pr-2 font-bold">担当</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => {
            const c = chartMap[v.id];
            const future = v.date > today;
            return (
              <tr
                key={v.id}
                onClick={() => onPick(v)}
                className={`cursor-pointer border-b align-top last:border-0 ${v.id === selId ? "bg-teal-50" : "hover:bg-slate-50"}`}
              >
                <td className="whitespace-nowrap py-2 pr-2">
                  <span className="font-bold text-slate-700">{v.date.slice(5).replace("-", "/")}</span>
                  {v.date === today && <span className="ml-1 rounded bg-teal-600 px-1 text-[10px] font-bold text-white">本日</span>}
                  {future && <span className="ml-1 rounded bg-blue-100 px-1 text-[10px] font-bold text-blue-600">予約</span>}
                </td>
                <td className="py-2 pr-2 text-slate-600">
                  <span className="line-clamp-2">{(c?.treatment || "").trim() || v.service_name || "—"}</span>
                </td>
                <td className="py-2 pr-2 text-slate-600"><span className="line-clamp-2">{(c?.progress || "").trim() || "—"}</span></td>
                <td className="whitespace-nowrap py-2 pr-2 text-slate-500">{staffName(v.staff_id) || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// 身体図：前面・背面にマーク（痛み/こり/しびれ/治療ポイント）を配置して可視化
function BodyMap({ value, onChange }: { value: Mark[]; onChange: (m: Mark[]) => void }) {
  const [type, setType] = useState<MarkType>("pain");
  const addAt = (side: "front" | "back", x: number, y: number) => {
    onChange([...value, { id: (crypto.randomUUID?.() ?? String(Date.now() + Math.random())), side, x, y, type }]);
  };
  const remove = (id: string) => onChange(value.filter((m) => m.id !== id));
  return (
    <div>
      {/* マーク種別の選択 */}
      <div className="mb-2 flex flex-wrap gap-1">
        {MARKS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setType(m.key)}
            className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold ${type === m.key ? "text-white" : "bg-white text-slate-600"}`}
            style={type === m.key ? { backgroundColor: m.color, borderColor: m.color } : { borderColor: "#cbd5e1" }}
          >
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} />
            {m.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange([])}
          className="ml-auto rounded-full border border-slate-300 px-2 py-1 text-[11px] font-bold text-slate-500 active:bg-slate-100"
        >
          リセット
        </button>
      </div>
      <div className="flex gap-2">
        <Figure side="front" label="前面" marks={value} onAdd={addAt} onRemove={remove} />
        <Figure side="back" label="背面" marks={value} onAdd={addAt} onRemove={remove} />
      </div>
      <p className="mt-1 text-[10px] text-slate-400">図をタップで追加／点をタップで削除</p>
    </div>
  );
}

function Figure({
  side, label, marks, onAdd, onRemove,
}: {
  side: "front" | "back";
  label: string;
  marks: Mark[];
  onAdd: (side: "front" | "back", x: number, y: number) => void;
  onRemove: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const click = (e: { clientX: number; clientY: number }) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    onAdd(side, x, y);
  };
  const mine = marks.filter((m) => m.side === side);
  return (
    <div className="flex-1">
      <div className="mb-1 text-center text-[11px] font-bold text-slate-500">{label}</div>
      <div ref={ref} onClick={click} className="relative mx-auto cursor-crosshair select-none" style={{ aspectRatio: "120 / 260" }}>
        <svg viewBox="0 0 120 260" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
          <g fill="#e5e7eb" stroke="#cbd5e1" strokeWidth="1">
            <ellipse cx="60" cy="24" rx="15" ry="18" />
            <rect x="53" y="40" width="14" height="10" rx="3" />
            <ellipse cx="60" cy="56" rx="26" ry="11" />
            <rect x="42" y="52" width="36" height="74" rx="14" />
            <rect x="22" y="54" width="13" height="72" rx="6" />
            <rect x="85" y="54" width="13" height="72" rx="6" />
            <rect x="46" y="118" width="13" height="96" rx="6" />
            <rect x="61" y="118" width="13" height="96" rx="6" />
            <ellipse cx="52" cy="220" rx="8" ry="5" />
            <ellipse cx="68" cy="220" rx="8" ry="5" />
          </g>
          {side === "back" && <line x1="60" y1="52" x2="60" y2="124" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />}
        </svg>
        {mine.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(m.id); }}
            title="タップで削除"
            className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
            style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, backgroundColor: markColor(m.type) }}
          />
        ))}
      </div>
    </div>
  );
}

// 新規患者の簡易登録
function AddPatientModal({
  supabase, onClose, onAdded,
}: {
  supabase: ReturnType<typeof createClient>;
  onClose: () => void;
  onAdded: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [kana, setKana] = useState("");
  const [birth, setBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    const nm = name.replace(/[\s　]/g, "").trim();
    if (!nm) { setErr("お名前を入力してください"); return; }
    setBusy(true);
    setErr(null);
    // 患者番号を採番（B + 通し番号。book_appointment と同じ方式）
    const { count } = await supabase.from("patients").select("id", { count: "exact", head: true });
    const num = "B" + String((count ?? 0) + 1).padStart(5, "0");
    const { data, error } = await supabase
      .from("patients")
      .insert({ patient_number: num, name: nm, name_kana: kana.replace(/[\s　]/g, "").trim() || null, birth_date: birth || null, phone: phone.trim() || null })
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) { setErr("登録に失敗しました：" + (error?.message || "?")); return; }
    onAdded((data as { id: string }).id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="mb-3 text-base font-bold text-slate-800">患者の新規登録</h2>
        <div className="space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="お名前（漢字フルネーム）" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input value={kana} onChange={(e) => setKana(e.target.value)} placeholder="ふりがな" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input value={birth} onChange={(e) => setBirth(e.target.value)} type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="電話番号" inputMode="tel" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        {err && <p className="mt-2 rounded bg-red-50 px-2 py-1 text-sm text-red-600">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-bold text-slate-600 active:bg-slate-100">キャンセル</button>
          <button onClick={save} disabled={busy} className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-bold text-white active:bg-teal-700 disabled:opacity-50">{busy ? "登録中…" : "登録"}</button>
        </div>
      </div>
    </div>
  );
}
