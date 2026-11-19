"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadAllStaff } from "@/lib/data";
import { minToLabel, toDateStr, WEEKDAY_LABELS } from "@/lib/booking";
import { ageAt } from "@/lib/pricing";
import type { Staff } from "@/lib/types";
import QuestionnaireForm from "@/components/QuestionnaireForm";
import { DEFAULT_SECTIONS, parseSections, toIntakeLinked, type QSection, type QValue } from "@/lib/questionnaire";
import { BodyMap, Pad, toStrokes, type MarkType, type Stroke } from "@/components/chart/marks";

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
  todayStart: number; // 当日来院の最早時刻（分）。当日なしは Infinity
};
type ChartFields = {
  complaint: string;
  findings: string;
  treatment: string;
  progress: string;
  note: string;
  body_marks: Stroke[];
  memo_marks: Stroke[]; // その回の手書きメモ
};
const EMPTY: ChartFields = { complaint: "", findings: "", treatment: "", progress: "", note: "", body_marks: [], memo_marks: [] };

// 初診時ページ（問診票の内容＋人体図）。患者ごとに1件保存。
type JointView = "front" | "back" | "left" | "right";
type JointDrawing = Record<JointView, Stroke[]>;
type Intake = {
  sport: string;        // 競技名
  weekly_freq: string;  // 週何回
  symptom_area: string; // 症状部位
  onset: string;        // いつから
  history: string;      // 過去の既往
  body_marks: Stroke[]; // 全身図の描き込み
  memo_marks: Stroke[]; // 手書きメモ（自由記入）
  joint_details: Record<string, JointDrawing>; // 関節ごとの前後左右
  questionnaire: QValue; // 問診票の全回答
  submitted_at: string | null; // 患者がLINEから送信した日時
};
const EMPTY_INTAKE: Intake = { sport: "", weekly_freq: "", symptom_area: "", onset: "", history: "", body_marks: [], memo_marks: [], joint_details: {}, questionnaire: {}, submitted_at: null };
const emptyJoint = (): JointDrawing => ({ front: [], back: [], left: [], right: [] });
// 選択できる関節（全身図から拡大）
const JOINTS = ["頸部", "右肩", "左肩", "右肘", "左肘", "右手首", "左手首", "腰", "右股関節", "左股関節", "右膝", "左膝", "右足首", "左足首"];
const VIEWS: { key: JointView; label: string }[] = [
  { key: "front", label: "前面" }, { key: "back", label: "後面" }, { key: "left", label: "左側面" }, { key: "right", label: "右側面" },
];
function normIntake(row: Record<string, unknown> | null): Intake {
  if (!row) return { ...EMPTY_INTAKE, joint_details: {} };
  const jd: Record<string, JointDrawing> = {};
  const raw = row.joint_details;
  const obj = typeof raw === "string" ? safeParse(raw) : raw;
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const vv = (v || {}) as Record<string, unknown>;
      jd[k] = { front: toStrokes(vv.front), back: toStrokes(vv.back), left: toStrokes(vv.left), right: toStrokes(vv.right) };
    }
  }
  const q = typeof row.questionnaire === "string" ? safeParse(row.questionnaire) : row.questionnaire;
  return {
    sport: (row.sport as string) ?? "",
    weekly_freq: (row.weekly_freq as string) ?? "",
    symptom_area: (row.symptom_area as string) ?? "",
    onset: (row.onset as string) ?? "",
    history: (row.history as string) ?? "",
    body_marks: toStrokes(typeof row.body_marks === "string" ? safeParse(row.body_marks) : row.body_marks),
    memo_marks: toStrokes(typeof row.memo_marks === "string" ? safeParse(row.memo_marks) : row.memo_marks),
    joint_details: jd,
    questionnaire: (q && typeof q === "object" ? (q as QValue) : {}),
    submitted_at: (row.submitted_at as string) ?? null,
  };
}
function safeParse(s: unknown): unknown { try { return typeof s === "string" ? JSON.parse(s) : s; } catch { return null; } }

// ペン（手書き変換）での誤字をカーソル位置から1文字ずつ消せるテキスト欄。
// 「⌫ 1字消す」はカーソル直前の1文字（選択中なら選択範囲）を削除する。
function PenTextarea({ value, onChange, placeholder, className }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const backspace = () => {
    const el = ref.current;
    const hasSel = el && el.selectionStart != null;
    const start = hasSel ? el!.selectionStart : value.length;
    const end = hasSel ? el!.selectionEnd : value.length;
    let next = value;
    let caret = start;
    if (start !== end) { next = value.slice(0, start) + value.slice(end); caret = start; }
    else if (start > 0) { next = value.slice(0, start - 1) + value.slice(start); caret = start - 1; }
    else return;
    onChange(next);
    requestAnimationFrame(() => { const e2 = ref.current; if (e2) { e2.focus(); try { e2.setSelectionRange(caret, caret); } catch { /* noop */ } } });
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-1 flex justify-end">
        <button type="button" onClick={backspace} disabled={!value.length}
          className="rounded-md border border-slate-300 px-2 py-0.5 text-[11px] font-bold text-slate-600 active:bg-slate-100 disabled:opacity-40">
          ⌫ 1字消す
        </button>
      </div>
      <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={className} />
    </div>
  );
}

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
  const [tab, setTab] = useState<"hatsushin" | "keika">("keika");
  const [keikaView, setKeikaView] = useState<"list" | "cards">("list"); // 経過記録の表示：縦一覧／横並び
  const [openVisit, setOpenVisit] = useState<{ v: ApptRow; idx: number } | null>(null); // その回の詳細ページ（身体図＋手書きメモ）

  // 選択患者の明細
  const [chartMap, setChartMap] = useState<Record<string, ChartFields & { is_draft?: boolean }>>({});
  const [referrer, setReferrer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // 初診時ページ
  const [intake, setIntake] = useState<Intake>(EMPTY_INTAKE);
  // 初診時の補足メモ（問診票JSON内の予約キーに保存＝DB列追加不要）
  const intakeMemo = typeof intake.questionnaire["__memo"] === "string" ? (intake.questionnaire["__memo"] as string) : "";
  const setIntakeMemo = (t: string) => setIntake((it) => ({ ...it, questionnaire: { ...it.questionnaire, __memo: t } }));
  const [qSections, setQSections] = useState<QSection[]>(DEFAULT_SECTIONS);
  const [selJoint, setSelJoint] = useState<string | null>(null);
  const [jointPen, setJointPen] = useState<MarkType>("pain");
  const [intakeSaving, setIntakeSaving] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [autoSelDone, setAutoSelDone] = useState(false);
  // 個別売上の担当別一覧から来た場合の戻り先（?from=sales&staff=&date=）
  const [backSales, setBackSales] = useState<string | null>(null);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("from") !== "sales") return;
    const qs = new URLSearchParams();
    const staffId = sp.get("staff"); const d = sp.get("date");
    if (staffId) qs.set("staff", staffId);
    if (d) qs.set("date", d);
    setBackSales(`/admin/sales${qs.toString() ? `?${qs.toString()}` : ""}`);
  }, []);

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

  // 問診票の質問定義（管理画面で編集した内容）を読み込み
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("settings").select("questionnaire_schema").eq("id", 1).maybeSingle();
        setQSections(parseSections((data as { questionnaire_schema?: unknown } | null)?.questionnaire_schema));
      } catch { /* 未マイグレーションなら既定 */ }
    })();
  }, [supabase]);

  // 患者（予約の氏名＋患者台帳）を1人にまとめる
  const persons = useMemo<Person[]>(() => {
    const map = new Map<string, Person>();
    const keyFor = (pid: string | null, name: string | null) => pid || "name:" + normName(name);
    for (const p of pats) {
      map.set(p.id, {
        key: p.id, patient_id: p.id, name: p.name, name_kana: p.name_kana, birth_date: p.birth_date,
        phone: p.phone, chart_note: p.chart_note, visits: [], lastVisit: null, visitCount: 0, hasToday: false, hasFuture: false, todayStart: Infinity,
      });
    }
    for (const a of appts) {
      const key = keyFor(a.patient_id, a.patient_name);
      let person = map.get(key);
      if (!person) {
        person = {
          key, patient_id: a.patient_id, name: a.patient_name || "（未登録）", name_kana: null, birth_date: null,
          phone: null, chart_note: null, visits: [], lastVisit: null, visitCount: 0, hasToday: false, hasFuture: false, todayStart: Infinity,
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
      const todayVs = vs.filter((v) => v.date === today);
      p.todayStart = todayVs.length ? Math.min(...todayVs.map((v) => v.start_min)) : Infinity;
      arr.push(p);
    }
    // 当日の来院者を最上部（来院時刻の早い順）→ その他は最終来院が新しい順
    arr.sort((a, b) =>
      (Number(b.hasToday) - Number(a.hasToday)) ||
      (a.hasToday ? a.todayStart - b.todayStart : (b.lastVisit || "").localeCompare(a.lastVisit || "")) ||
      a.name.localeCompare(b.name, "ja")
    );
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

  // 患者を選んだら：経過記録（カルテ）＋初診時（問診票・人体図）＋紹介元を読み込み
  const openPerson = useCallback(async (p: Person) => {
    setSelKey(p.key);
    setTab("keika");
    setSelJoint(null);
    setMsg(null);
    setChartMap({});
    setReferrer(null);
    setIntake(EMPTY_INTAKE);

    const apptIds = p.visits.map((v) => v.id);
    // 経過記録（列未マイグレーションでも落ちないよう段階的に）
    const cm: Record<string, ChartFields & { is_draft?: boolean }> = {};
    if (apptIds.length) {
      let rows: Record<string, unknown>[] | null = null;
      const full = await supabase
        .from("chart_entries")
        .select("appointment_id, complaint, findings, progress, treatment, note, body_marks, memo_marks, is_draft")
        .in("appointment_id", apptIds);
      if (full.error) {
        // memo_marks 未マイグレーションでも body_marks は残す
        const mid = await supabase
          .from("chart_entries")
          .select("appointment_id, complaint, findings, progress, treatment, note, body_marks, is_draft")
          .in("appointment_id", apptIds);
        if (mid.error) {
          const base = await supabase
            .from("chart_entries")
            .select("appointment_id, complaint, findings, progress, treatment, note")
            .in("appointment_id", apptIds);
          rows = (base.data as Record<string, unknown>[] | null) ?? [];
        } else {
          rows = (mid.data as Record<string, unknown>[] | null) ?? [];
        }
      } else {
        rows = (full.data as Record<string, unknown>[] | null) ?? [];
      }
      rows.forEach((r) => {
        const bm = r.body_marks;
        const mm = r.memo_marks;
        // 「症状の変化」と「施術内容」は1つにまとめる。旧データの施術内容は症状欄へ統合（保存で正式に一本化）。
        const prog = ((r.progress as string) ?? "").trim();
        const treat = ((r.treatment as string) ?? "").trim();
        cm[r.appointment_id as string] = {
          complaint: (r.complaint as string) ?? "",
          findings: (r.findings as string) ?? "",
          progress: [prog, treat].filter(Boolean).join("\n"),
          treatment: "",
          note: (r.note as string) ?? "",
          body_marks: toStrokes(Array.isArray(bm) ? bm : (typeof bm === "string" && bm ? JSON.parse(bm) : [])),
          memo_marks: toStrokes(Array.isArray(mm) ? mm : (typeof mm === "string" && mm ? JSON.parse(mm) : [])),
          is_draft: (r.is_draft as boolean) ?? false,
        };
      });
    }
    setChartMap(cm);

    // 初診時（問診票の内容＋人体図）。テーブル未作成でも落ちない。
    if (p.patient_id) {
      try {
        const { data: it } = await supabase.from("patient_intake").select("*").eq("patient_id", p.patient_id).maybeSingle();
        setIntake(normIntake((it as Record<string, unknown>) ?? null));
      } catch { setIntake(EMPTY_INTAKE); }
    }

    // 紹介元（新患名簿の紹介者を氏名でリンク）
    try {
      const { data: np } = await supabase.from("new_patients").select("name, referrer, date").order("date", { ascending: false }).limit(3000);
      const key = normName(p.name);
      const hit = ((np as { name: string; referrer: string | null }[] | null) ?? []).find((r) => normName(r.name) === key && (r.referrer || "").trim());
      setReferrer(hit?.referrer?.trim() || null);
    } catch { setReferrer(null); }
  }, [supabase]);

  // 個別売上などから ?p=<patient_id> / ?n=<氏名> で開かれたら、その患者を自動で選択
  useEffect(() => {
    if (autoSelDone || loading || persons.length === 0) return;
    const sp = new URLSearchParams(window.location.search);
    const p = sp.get("p");
    const n = sp.get("n");
    if (p || n) {
      const target = p ? persons.find((x) => x.patient_id === p) : persons.find((x) => normName(x.name) === normName(n));
      if (target) openPerson(target);
    }
    setAutoSelDone(true);
  }, [autoSelDone, loading, persons, openPerson]);

  // 経過記録カードの編集（その場でchartMapを更新）
  const getEntry = (id: string): ChartFields & { is_draft?: boolean } => chartMap[id] ?? EMPTY;
  function updateEntry(id: string, patch: Partial<ChartFields>) {
    setChartMap((m) => ({ ...m, [id]: { ...(m[id] ?? EMPTY), ...patch } }));
  }
  // 1来院分のカルテ記録を保存
  async function saveEntry(v: ApptRow) {
    if (!selected) return;
    setSaving(true);
    setMsg(null);
    const d = getEntry(v.id);
    const base = {
      appointment_id: v.id,
      patient_id: selected.patient_id,
      staff_id: v.staff_id,
      date: v.date,
      complaint: (d.complaint || "").trim() || null,
      findings: (d.findings || "").trim() || null,
      progress: (d.progress || "").trim() || null,
      treatment: (d.treatment || "").trim() || null,
      note: (d.note || "").trim() || null,
      updated_at: new Date().toISOString(),
    };
    const full = { ...base, body_marks: d.body_marks ?? [], memo_marks: d.memo_marks ?? [] };
    let { error } = await supabase.from("chart_entries").upsert(full, { onConflict: "appointment_id" });
    if (error) {
      // memo_marks 未マイグレーションなら body_marks だけで再試行、さらに失敗なら最小列で
      const mid = { ...base, body_marks: d.body_marks ?? [] };
      ({ error } = await supabase.from("chart_entries").upsert(mid, { onConflict: "appointment_id" }));
      if (error) ({ error } = await supabase.from("chart_entries").upsert(base, { onConflict: "appointment_id" }));
    }
    setSaving(false);
    setMsg(error ? "保存に失敗しました" : "保存しました");
  }
  // 経過記録（縦一覧）をまとめて保存：内容のある回だけ upsert
  async function saveAllEntries() {
    if (!selected) return;
    setSaving(true);
    setMsg(null);
    let err: unknown = null;
    for (const v of pastVisits) {
      const d = getEntry(v.id);
      const empty = !(d.progress || "").trim() && !(d.treatment || "").trim() && !(d.complaint || "").trim() && !(d.findings || "").trim() && !(d.note || "").trim() && !(d.body_marks?.length);
      if (empty) continue;
      const base = {
        appointment_id: v.id, patient_id: selected.patient_id, staff_id: v.staff_id, date: v.date,
        complaint: (d.complaint || "").trim() || null, findings: (d.findings || "").trim() || null,
        progress: (d.progress || "").trim() || null, treatment: (d.treatment || "").trim() || null,
        note: (d.note || "").trim() || null, updated_at: new Date().toISOString(),
      };
      const full = { ...base, body_marks: d.body_marks ?? [], memo_marks: d.memo_marks ?? [] };
      let { error } = await supabase.from("chart_entries").upsert(full, { onConflict: "appointment_id" });
      if (error) {
        const mid = { ...base, body_marks: d.body_marks ?? [] };
        ({ error } = await supabase.from("chart_entries").upsert(mid, { onConflict: "appointment_id" }));
        if (error) ({ error } = await supabase.from("chart_entries").upsert(base, { onConflict: "appointment_id" }));
      }
      if (error) err = error;
    }
    setSaving(false);
    setMsg(err ? "一部の保存に失敗しました" : "保存しました");
  }

  // 初診時ページ（問診票＋人体図）を保存
  async function saveIntake() {
    if (!selected?.patient_id) { setMsg("この患者は予約から登録されていないため初診時ページを保存できません"); return; }
    setIntakeSaving(true);
    setMsg(null);
    const linked = toIntakeLinked(intake.questionnaire, qSections);
    const row = {
      patient_id: selected.patient_id,
      sport: linked.sport || null,
      weekly_freq: linked.weekly_freq || null,
      symptom_area: linked.symptom_area || null,
      onset: linked.onset || null,
      history: linked.history || null,
      body_marks: intake.body_marks,
      memo_marks: intake.memo_marks,
      joint_details: intake.joint_details,
      questionnaire: intake.questionnaire,
      updated_at: new Date().toISOString(),
    };
    let { error } = await supabase.from("patient_intake").upsert(row, { onConflict: "patient_id" });
    if (error) {
      // questionnaire 列が未マイグレーションでも保存できるようにフォールバック
      const { questionnaire: _q, memo_marks: _m, ...base } = row;
      void _q; void _m;
      ({ error } = await supabase.from("patient_intake").upsert(base, { onConflict: "patient_id" }));
      if (!error) { setIntakeSaving(false); setMsg("保存しました（※問診票は列追加が必要です）"); return; }
    }
    setIntakeSaving(false);
    setMsg(error ? "初診時ページの保存に失敗しました（patient_intake の作成が必要です）" : "初診時ページを保存しました");
  }

  // 関節詳細の1ビューを更新
  function setJointView(joint: string, view: JointView, strokes: Stroke[]) {
    setIntake((it) => {
      const jd = { ...it.joint_details };
      const cur = jd[joint] ?? emptyJoint();
      jd[joint] = { ...cur, [view]: strokes };
      return { ...it, joint_details: jd };
    });
  }

  const statusBadge = (p: Person) =>
    p.hasToday ? { t: "来院中", c: "bg-teal-100 text-teal-700" }
    : p.hasFuture ? { t: "予約あり", c: "bg-blue-100 text-blue-700" }
    : p.visitCount >= 2 ? { t: "再来", c: "bg-slate-100 text-slate-500" }
    : { t: "初診", c: "bg-amber-100 text-amber-700" };

  // 実来院（当日以前）を古い順に（1回目＝初診）
  const pastVisits = useMemo(
    () => (selected ? [...selected.visits].filter((v) => v.date <= today).sort((a, b) => a.date.localeCompare(b.date) || a.start_min - b.start_min) : []),
    [selected, today]
  );

  return (
    <div className="flex h-[calc(100dvh-110px)] gap-3">
      {/* ── 左：患者一覧（スマホは一覧 or カルテのどちらかを全幅表示） ── */}
      <aside className={`${selKey ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col rounded-xl border bg-white md:w-52`}>
        {backSales && (
          <a href={backSales} className="m-2 inline-flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white shadow-sm active:bg-blue-700">
            ← 個別売上に戻る
          </a>
        )}
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
              className={`flex-1 whitespace-nowrap rounded-md px-0.5 py-1.5 text-[11px] ${filter === k ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-500"}`}
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
      <main className={`${selKey ? "block" : "hidden md:block"} min-w-0 flex-1 overflow-y-auto rounded-xl border bg-white`}>
        {!selected ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">左の一覧から患者を選んでください</div>
        ) : (
          <div className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <button onClick={() => setSelKey(null)} className="flex items-center gap-1 text-sm font-bold text-teal-700 active:opacity-70 md:hidden">
                ‹ 患者一覧へ
              </button>
              {backSales && (
                <a href={backSales} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white shadow-sm active:bg-blue-700">
                  ← 個別売上に戻る
                </a>
              )}
            </div>
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
              {([["hatsushin", "初診時"], ["keika", "経過記録"]] as const).map(([k, l]) => (
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

            {/* ── 初診時ページ ── */}
            {tab === "hatsushin" && (
              <div>
                {!selected.patient_id && (
                  <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">この患者は予約から登録されていないため、初診時ページの保存はできません（閲覧のみ）。</p>
                )}
                {/* 概要（問診票から自動反映） */}
                {(() => {
                  const lk = toIntakeLinked(intake.questionnaire, qSections);
                  const chips: [string, string][] = [["競技", lk.sport], ["週何回", lk.weekly_freq], ["症状部位", lk.symptom_area], ["いつから", lk.onset], ["既往", lk.history]];
                  return (
                    <div className="mb-3 rounded-xl border bg-slate-50 p-2.5">
                      <div className="mb-1 flex items-center gap-2 text-[11px] font-bold text-slate-400">
                        問診票サマリ
                        {intake.submitted_at && <span className="rounded bg-emerald-100 px-1 text-[10px] font-bold text-emerald-700">患者送信 {new Date(intake.submitted_at).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}</span>}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {chips.map(([l, v]) => (
                          <span key={l} className="text-sm"><span className="mr-1 text-[11px] font-bold text-teal-600">{l}</span><span className="font-bold text-slate-700">{v || "—"}</span></span>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <div className="grid gap-4 lg:grid-cols-2">
                  {/* 左：人体図＋手書きメモ */}
                  <div className="space-y-3">
                    <div className="rounded-xl border p-3">
                      <div className="mb-2 text-sm font-bold text-slate-600">人体図（痛み・損傷部位）</div>
                      <BodyMap value={intake.body_marks} onChange={(bm) => setIntake((it) => ({ ...it, body_marks: bm }))} />
                    </div>
                    <div className="rounded-xl border p-3">
                      <div className="mb-2 text-sm font-bold text-slate-600">手書きメモ</div>
                      <Pad label="指やペンで自由に書き込めます" strokes={intake.memo_marks} onChange={(s) => setIntake((it) => ({ ...it, memo_marks: s }))} penType="treat" penColor="#1f2937" aspect="4 / 3"
                        onTranscribed={(t) => setIntakeMemo((intakeMemo.trim() ? intakeMemo.trimEnd() + "\n" : "") + t)} />
                    </div>
                    <div className="rounded-xl border p-3">
                      <div className="mb-2 text-sm font-bold text-slate-600">メモ（補足・申し送り）</div>
                      <textarea value={intakeMemo} onChange={(e) => setIntakeMemo(e.target.value)} rows={4}
                        placeholder="手書きメモの「✍️文字起こし」結果もここに入ります"
                        className="w-full resize-y rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-teal-500 focus:outline-none" />
                    </div>
                  </div>

                  {/* 右：問診票（全項目・編集可。初診時は省スペース2列表示） */}
                  <div>
                    <div className="mb-2 text-sm font-bold text-slate-600">問診票</div>
                    <QuestionnaireForm value={intake.questionnaire} onChange={(q) => setIntake((it) => ({ ...it, questionnaire: q }))} sections={qSections} compact />
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <button onClick={saveIntake} disabled={intakeSaving || !selected.patient_id} className="rounded-lg bg-teal-600 px-6 py-2 text-sm font-bold text-white active:bg-teal-700 disabled:opacity-50">{intakeSaving ? "保存中…" : "初診時ページを保存"}</button>
                </div>
              </div>
            )}

            {/* ── 経過記録ページ ── */}
            {tab === "keika" && (
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <div className="inline-flex overflow-hidden rounded-lg border">
                    <button onClick={() => setKeikaView("list")} className={`px-3 py-1 text-xs font-bold ${keikaView === "list" ? "bg-teal-600 text-white" : "bg-white text-slate-500"}`}>一覧（縦）</button>
                    <button onClick={() => setKeikaView("cards")} className={`px-3 py-1 text-xs font-bold ${keikaView === "cards" ? "bg-teal-600 text-white" : "bg-white text-slate-500"}`}>横並び</button>
                  </div>
                  <span className="text-xs text-slate-400">{keikaView === "list" ? "複数回をまとめて確認・記入" : "横スクロールで見比べ"}</span>
                  <button onClick={() => setTab("hatsushin")} className="ml-auto rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-700 active:bg-teal-100">初診時を見る ›</button>
                </div>
                {pastVisits.length === 0 ? (
                  <p className="rounded-lg border bg-slate-50 py-6 text-center text-sm text-slate-400">来院記録がありません</p>
                ) : keikaView === "list" ? (
                  <div className="space-y-2">
                    {pastVisits.map((v, i) => {
                      const d = getEntry(v.id);
                      return (
                        <div key={v.id} className="flex gap-3 rounded-xl border p-3">
                          <button onClick={() => setOpenVisit({ v, idx: i })} title="この回のページを開く（身体図・手書きメモ）"
                            className="w-14 shrink-0 rounded-lg px-1 py-1 text-center hover:bg-teal-50 active:bg-teal-100">
                            <div className="text-sm font-bold text-teal-600 underline decoration-teal-300 underline-offset-2">{i === 0 ? "初診" : `${i + 1}回`}</div>
                            <div className="mt-0.5 text-[11px] font-bold text-slate-500">{v.date.slice(5).replace("-", "/")}</div>
                            <div className="text-[10px] text-slate-400">（{WEEKDAY_LABELS[new Date(v.date + "T00:00:00").getDay()]}）</div>
                            <div className="text-[10px] text-slate-400">{minToLabel(v.start_min)}</div>
                          </button>
                          <textarea value={d.progress} onChange={(e) => updateEntry(v.id, { progress: e.target.value })} onBlur={() => saveEntry(v)} rows={3}
                            placeholder="症状・アプローチ（例）出力四肢低い→脊柱通電"
                            className="min-w-0 flex-1 resize-y rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-teal-500 focus:outline-none" />
                        </div>
                      );
                    }).reverse()}
                    <div className="pt-1 text-right">
                      <button onClick={saveAllEntries} disabled={saving} className="rounded-lg bg-teal-600 px-6 py-2 text-sm font-bold text-white active:bg-teal-700 disabled:opacity-50">{saving ? "保存中…" : "まとめて保存"}</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {pastVisits.map((v, i) => {
                      const d = getEntry(v.id);
                      return (
                        <div key={v.id} className="flex w-64 shrink-0 flex-col rounded-xl border">
                          <div className="rounded-t-xl bg-slate-50 px-3 py-2 text-center text-sm font-bold text-slate-700">
                            {i === 0 ? "初診（1回目）" : `${i + 1}回目`}
                          </div>
                          <div className="flex-1 space-y-2 p-3">
                            <div>
                              <div className="mb-0.5 text-[11px] font-bold text-teal-600">📅 日付</div>
                              <div className="rounded-md bg-slate-100 px-2 py-1 text-sm font-bold text-slate-700">
                                {v.date.replace(/-/g, "/")}（{WEEKDAY_LABELS[new Date(v.date + "T00:00:00").getDay()]}）{minToLabel(v.start_min)}
                              </div>
                            </div>
                            <div>
                              <div className="mb-0.5 text-[11px] font-bold text-teal-600">📊 症状・アプローチ</div>
                              <textarea value={d.progress} onChange={(e) => updateEntry(v.id, { progress: e.target.value })} rows={9} placeholder="症状に対してのアプローチを横に。例）出力四肢低い→脊柱通電" className="w-full resize-y rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-teal-500 focus:outline-none" />
                            </div>
                          </div>
                          <div className="border-t p-2 text-right">
                            <button onClick={() => saveEntry(v)} disabled={saving} className="rounded-lg bg-teal-600 px-4 py-1.5 text-xs font-bold text-white active:bg-teal-700 disabled:opacity-50">保存</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {addOpen && <AddPatientModal supabase={supabase} onClose={() => setAddOpen(false)} onAdded={async (id) => { setAddOpen(false); await load(); setSelKey(id); }} />}

      {/* その回の詳細ページ（身体図＋手書きメモ＋症状・アプローチ） */}
      {openVisit && (() => {
        const v = openVisit.v;
        const i = openVisit.idx;
        const d = getEntry(v.id);
        const title = i === 0 ? "初診（1回目）" : `${i + 1}回目`;
        return (
          <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:p-6" onClick={() => setOpenVisit(null)}>
            <div className="w-full max-w-5xl rounded-2xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-teal-50 px-2 py-0.5 text-sm font-bold text-teal-700">{title}</span>
                <span className="text-sm font-bold text-slate-700">{selected?.name}</span>
                <span className="text-xs text-slate-500">{v.date.replace(/-/g, "/")}（{WEEKDAY_LABELS[new Date(v.date + "T00:00:00").getDay()]}）{minToLabel(v.start_min)}</span>
                {backSales && (
                  <a href={backSales} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm active:bg-blue-700">
                    ← 個別売上に戻る
                  </a>
                )}
                <button onClick={() => setOpenVisit(null)} className={`${backSales ? "" : "ml-auto"} rounded px-2 text-lg text-slate-400 active:bg-slate-100`}>✕</button>
              </div>
              <div className="grid items-stretch gap-4 lg:grid-cols-2">
                <div className="flex flex-col">
                  <div className="flex flex-1 flex-col rounded-xl border p-3">
                    <div className="mb-2 text-sm font-bold text-slate-600">人体図（痛み・損傷部位）</div>
                    <BodyMap value={d.body_marks} onChange={(bm) => updateEntry(v.id, { body_marks: bm })} />
                  </div>
                </div>
                <div className="flex flex-col">
                  <div className="flex flex-1 flex-col rounded-xl border p-3">
                    <div className="mb-1 text-[11px] font-bold text-teal-600">📊 症状・アプローチ</div>
                    <PenTextarea value={d.progress} onChange={(val) => updateEntry(v.id, { progress: val })}
                      placeholder="症状に対してのアプローチを横に。例）出力四肢低い→脊柱通電"
                      className="min-h-[320px] w-full flex-1 resize-y rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-teal-500 focus:outline-none" />
                  </div>
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={() => setOpenVisit(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 active:bg-slate-100">閉じる</button>
                <button onClick={() => saveEntry(v)} disabled={saving} className="rounded-lg bg-teal-600 px-6 py-2 text-sm font-bold text-white active:bg-teal-700 disabled:opacity-50">{saving ? "保存中…" : "保存"}</button>
              </div>
            </div>
          </div>
        );
      })()}
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
            <th className="py-1.5 pr-2 font-bold">症状・アプローチ（抜粋）</th>
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
                  <span className="line-clamp-2">{[(c?.progress || "").trim(), (c?.treatment || "").trim()].filter(Boolean).join(" / ") || v.service_name || "—"}</span>
                </td>
                <td className="whitespace-nowrap py-2 pr-2 text-slate-500">{staffName(v.staff_id) || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// 簡易な関節線画（下地のプレースホルダ）。public/joints/ に画像を置けば差し替わる。
function JointSketch({ view }: { view: JointView }) {
  const g = { fill: "none", stroke: "#cbd5e1", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (view === "front" || view === "back") {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
        <g {...g}>
          <path d="M40,6 C37,24 37,36 44,45 L56,45 C63,36 63,24 60,6" />
          <path d="M44,57 C40,74 40,86 43,96 M56,57 C60,74 60,86 57,96" />
          {view === "front" ? (
            <>
              <ellipse cx="50" cy="51" rx="15" ry="8" />
              <circle cx="50" cy="50" r="6" />
            </>
          ) : (
            <>
              <circle cx="44" cy="51" r="5" />
              <circle cx="56" cy="51" r="5" />
              <line x1="50" y1="45" x2="50" y2="58" />
            </>
          )}
        </g>
      </svg>
    );
  }
  const flip = view === "left" ? "translate(100,0) scale(-1,1)" : undefined;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
      <g {...g} transform={flip}>
        <path d="M44,6 C41,26 41,38 45,47" />
        <path d="M60,6 C64,26 61,38 56,45" />
        <ellipse cx="53" cy="51" rx="11" ry="12" />
        <path d="M46,58 C42,76 42,86 45,96" />
        <path d="M58,56 C61,76 59,86 56,96" />
      </g>
    </svg>
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
