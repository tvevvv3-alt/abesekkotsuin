"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { createClient } from "@/lib/supabase/client";
import { minToLabel } from "@/lib/booking";
import { Pad, toStrokes, type Stroke } from "@/components/chart/marks";

const PER_COURSE = 8; // 8回で1クール
const safeParse = (s: unknown): unknown => { try { return typeof s === "string" ? JSON.parse(s) : s; } catch { return null; } };
const asStrokes = (v: unknown): Stroke[] => toStrokes(typeof v === "string" ? safeParse(v) : v);

// 内容に合わせて高さが自動で伸びるテキストエリア（内部スクロール無し＝書いた分を全部表示）
// withBackspace=true で、ペン変換の誤字をカーソル位置から1文字ずつ消せる「⌫ 1字消す」を表示。
function AutoTextarea({ value, onChange, disabled, placeholder, className, withBackspace }: {
  value: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  withBackspace?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(fit, [value]);
  const applyAt = (make: (start: number, end: number) => { next: string; caret: number } | null) => {
    if (!onChange) return;
    const el = ref.current;
    const hasSel = el && el.selectionStart != null;
    const start = hasSel ? el!.selectionStart : value.length;
    const end = hasSel ? el!.selectionEnd : value.length;
    const r = make(start, end);
    if (!r) return;
    onChange(r.next);
    requestAnimationFrame(() => { const e2 = ref.current; if (e2) { e2.focus(); try { e2.setSelectionRange(r.caret, r.caret); } catch { /* noop */ } } });
  };
  const insert = (s: string) => applyAt((start, end) => ({ next: value.slice(0, start) + s + value.slice(end), caret: start + s.length }));
  const backspace = () => applyAt((start, end) => {
    if (start !== end) return { next: value.slice(0, start) + value.slice(end), caret: start };
    if (start > 0) return { next: value.slice(0, start - 1) + value.slice(start), caret: start - 1 };
    return null;
  });
  const area = (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => { onChange?.(e.target.value); fit(); }}
      disabled={disabled}
      placeholder={placeholder}
      rows={2}
      className={className}
    />
  );
  if (!withBackspace) return area;
  const btn = "rounded-md border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 active:bg-slate-100 disabled:opacity-40";
  return <PenButtons area={area} value={value} onChange={onChange} disabled={disabled} insert={insert} backspace={backspace} btn={btn} />;
}

// テキスト操作ボタン＋手書き（文字起こし）トグル。手書きで書いて「文字起こし」でメモに追記。
function PenButtons({ area, value, onChange, disabled, insert, backspace, btn }: {
  area: ReactNode;
  value: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
  insert: (s: string) => void;
  backspace: () => void;
  btn: string;
}) {
  const [penOpen, setPenOpen] = useState(false);
  const [penStrokes, setPenStrokes] = useState<Stroke[]>([]);
  const appendTranscribed = (t: string) => {
    if (!onChange) return;
    const sep = value && !value.endsWith("\n") ? "\n" : "";
    onChange(value + sep + t.trim());
    setPenStrokes([]);
  };
  return (
    <div>
      {area}
      {/* 操作ボタン（テキスト枠から離す＋ペン押下で直接実行しScribble誤反応を防ぐ） */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onPointerDown={(e) => { e.preventDefault(); insert(" "); }} disabled={disabled} className={btn}>␣ スペース</button>
        <button type="button" onPointerDown={(e) => { e.preventDefault(); insert("\n"); }} disabled={disabled} className={btn}>↵ 改行</button>
        <button type="button" onPointerDown={(e) => { e.preventDefault(); backspace(); }} disabled={disabled || !value.length} className={btn}>⌫ 1字消す</button>
        {/* 手書きで文字起こしする／しないを選べる（既定は閉じる＝キーボード/Scribble入力） */}
        <button type="button" onPointerDown={(e) => { e.preventDefault(); setPenOpen((o) => !o); }} disabled={disabled}
          className={`rounded-md px-3 py-1.5 text-xs font-bold ${penOpen ? "bg-orange-600 text-white" : "border border-orange-300 text-orange-700"} disabled:opacity-40`}>
          {penOpen ? "✍️ 手書きを閉じる" : "✍️ 手書きで文字起こし"}
        </button>
      </div>
      {penOpen && !disabled && (
        <div className="mt-2 rounded-lg border border-slate-200 p-2">
          <Pad strokes={penStrokes} onChange={setPenStrokes} penType="treat" penColor="#0f172a" aspect="3 / 1" onTranscribed={appendTranscribed} />
          <div className="mt-1 flex items-center justify-between">
            <p className="text-[11px] text-slate-400">手書きして「✍️文字起こし」を押すと、上のメモに文章が追加されます。</p>
            <button type="button" onPointerDown={(e) => { e.preventDefault(); setPenStrokes([]); }} disabled={!penStrokes.length} className={btn}>消す</button>
          </div>
        </div>
      )}
    </div>
  );
}

type Visit = { id: string; date: string; start_min: number; status: string };

// 体幹教室カルテ（8回枠）。日付は予約から自動、各回は自由メモ。
export default function ClassChartModal({
  name, classId, supabase, onClose,
}: {
  name: string;
  classId: string;
  supabase: ReturnType<typeof createClient>;
  onClose: () => void;
}) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [bodyMarks, setBodyMarks] = useState<Record<string, Stroke[]>>({});
  const [memoMarks, setMemoMarks] = useState<Record<string, Stroke[]>>({});
  const [openVisit, setOpenVisit] = useState<{ v: Visit; no: number } | null>(null);
  const [memo, setMemo] = useState("");
  const [sport, setSport] = useState("");
  const [grade, setGrade] = useState("");
  const [team, setTeam] = useState("");
  const [course, setCourse] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: ap } = await supabase
      .from("appointments")
      .select("id, date, start_min, status")
      .eq("service_id", classId)
      .eq("patient_name", name)
      .neq("status", "cancelled")
      .order("date")
      .order("start_min");
    const vs = (ap as Visit[]) ?? [];
    setVisits(vs);
    // 各回メモ＋身体図＋手書きメモ（テーブル・列が未作成でも落ちない）
    const nm: Record<string, string> = {};
    const bm: Record<string, Stroke[]> = {};
    const mm: Record<string, Stroke[]> = {};
    const ids = vs.map((v) => v.id);
    if (ids.length) {
      const full = await supabase.from("class_notes").select("appointment_id, note, body_marks, memo_marks").in("appointment_id", ids);
      const rows = full.error
        ? ((await supabase.from("class_notes").select("appointment_id, note").in("appointment_id", ids)).data as Record<string, unknown>[] | null)
        : (full.data as Record<string, unknown>[] | null);
      (rows ?? []).forEach((r) => {
        const id = r.appointment_id as string;
        nm[id] = (r.note as string | null) ?? "";
        bm[id] = asStrokes(r.body_marks);
        mm[id] = asStrokes(r.memo_marks);
      });
    }
    setNotes(nm);
    setBodyMarks(bm);
    setMemoMarks(mm);
    // 全体メモ＋競技/学年/チーム（列が無くても落ちない）
    type Mem = { note?: string | null; sport?: string | null; grade?: string | null; team?: string | null };
    let mem: Mem | null = null;
    const full = await supabase.from("class_members").select("note, sport, grade, team").eq("name", name).maybeSingle();
    if (full.error) {
      const base = await supabase.from("class_members").select("note").eq("name", name).maybeSingle();
      mem = (base.data as Mem | null) ?? null;
    } else mem = (full.data as Mem | null) ?? null;
    setMemo(mem?.note ?? "");
    setSport(mem?.sport ?? "");
    setGrade(mem?.grade ?? "");
    setTeam(mem?.team ?? "");
    // 既定は最新クール
    const courses = Math.max(1, Math.ceil(vs.length / PER_COURSE));
    setCourse(courses - 1);
    setLoading(false);
  }, [supabase, classId, name]);

  useEffect(() => { load(); }, [load]);

  const courses = Math.max(1, Math.ceil(visits.length / PER_COURSE));
  // 現在クールの8枠（予約があればその日付、無ければ空）
  const slots = useMemo(() => {
    return Array.from({ length: PER_COURSE }, (_, i) => visits[course * PER_COURSE + i] ?? null);
  }, [visits, course]);

  // 各回のレコードを保存（身体図・手書きメモ列が無くてもメモだけは残す）
  async function persistNotes(ids: string[]): Promise<string | null> {
    if (!ids.length) return null;
    const base = ids.map((id) => ({ appointment_id: id, note: (notes[id] ?? "").trim() || null, updated_at: new Date().toISOString() }));
    const full = base.map((b) => ({ ...b, body_marks: bodyMarks[b.appointment_id] ?? [], memo_marks: memoMarks[b.appointment_id] ?? [] }));
    const { error } = await supabase.from("class_notes").upsert(full, { onConflict: "appointment_id" });
    if (!error) return null;
    const { error: e2 } = await supabase.from("class_notes").upsert(base, { onConflict: "appointment_id" });
    return e2 ? "各回メモの保存に失敗（class_notes の作成が必要です）" : "身体図・手書きは列追加が必要です（メモは保存）";
  }

  // 詳細ページ（1回分）の保存
  async function saveVisit(id: string) {
    setSaving(true);
    setMsg(null);
    const err = await persistNotes([id]);
    setSaving(false);
    setMsg(err ?? "保存しました");
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    // 各回メモ・身体図（記入のある予約だけ）
    const ids = [...new Set([...Object.keys(notes), ...Object.keys(bodyMarks), ...Object.keys(memoMarks)])]
      .filter((id) => (notes[id] ?? "").trim() || (bodyMarks[id]?.length) || (memoMarks[id]?.length));
    let err = await persistNotes(ids);
    // 全体メモ＋競技/学年/チーム（会員台帳）
    const full = { name, note: memo.trim() || null, sport: sport.trim() || null, grade: grade.trim() || null, team: team.trim() || null };
    const { error: e2 } = await supabase.from("class_members").upsert(full, { onConflict: "name" });
    if (e2) {
      const { error: e3 } = await supabase.from("class_members").upsert({ name, note: memo.trim() || null }, { onConflict: "name" });
      if (!e3 && !err) err = "競技/学年/チームは列追加が必要です（メモは保存）";
      else if (e3 && !err) err = "全体メモの保存に失敗しました";
    }
    setSaving(false);
    setMsg(err ?? "保存しました");
  }

  return (
    <>
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-base font-bold text-slate-800">{name} <span className="text-xs font-normal text-slate-400">体幹カルテ（8回枠）</span></h2>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 active:bg-slate-100">✕</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="py-10 text-center text-sm text-slate-400">読み込み中…</p>
          ) : (
            <>
              {/* 競技・学年・チーム */}
              <div className="mb-3 grid grid-cols-3 gap-2">
                {([["競技", sport, setSport, "例：サッカー"], ["学年", grade, setGrade, "例：高3"], ["チーム", team, setTeam, "例：○○FC"]] as const).map(([label, val, setter, ph]) => (
                  <div key={label}>
                    <label className="mb-1 block text-xs font-bold text-slate-500">{label}</label>
                    <input value={val} onChange={(e) => setter(e.target.value)} placeholder={ph}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-orange-500 focus:outline-none" />
                  </div>
                ))}
              </div>

              {/* 全体メモ */}
              <div className="mb-3">
                <label className="mb-1 block text-xs font-bold text-slate-500">メモ（目標・申し送りなど）</label>
                <AutoTextarea value={memo} onChange={setMemo} withBackspace
                  className="w-full resize-none overflow-hidden rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none" />
              </div>

              {/* クール切替 */}
              {courses > 1 && (
                <div className="mb-2 flex items-center justify-center gap-3 text-sm">
                  <button onClick={() => setCourse((c) => Math.max(0, c - 1))} disabled={course === 0} className="rounded-lg border px-3 py-1 font-bold text-slate-600 disabled:opacity-40">‹</button>
                  <span className="font-bold text-slate-700">クール {course + 1} / {courses}</span>
                  <button onClick={() => setCourse((c) => Math.min(courses - 1, c + 1))} disabled={course >= courses - 1} className="rounded-lg border px-3 py-1 font-bold text-slate-600 disabled:opacity-40">›</button>
                </div>
              )}

              {/* 8回枠（直近を上に） */}
              <div className="divide-y rounded-xl border">
                {slots.map((v, i) => {
                  const no = course * PER_COURSE + i + 1;
                  return (
                    <div key={i} className="flex items-start gap-2 p-2">
                      <button
                        type="button"
                        onClick={() => { if (v) setOpenVisit({ v, no }); }}
                        disabled={!v}
                        className="w-12 shrink-0 rounded-lg py-1 text-center active:bg-orange-50 disabled:cursor-default"
                      >
                        <div className="text-[10px] font-bold text-orange-500">{no}回</div>
                        <div className="mt-0.5 whitespace-nowrap text-[10px] text-slate-600">
                          {v ? `${v.date.slice(5).replace("-", "/")}` : "—"}
                        </div>
                        {v && <div className="text-[9px] text-slate-400">{minToLabel(v.start_min)}</div>}
                        {v && <div className="mt-0.5 text-[9px] font-bold text-sky-500">詳細 ›</div>}
                      </button>
                      <AutoTextarea
                        value={v ? (notes[v.id] ?? "") : ""}
                        onChange={(val) => { if (v) setNotes((n) => ({ ...n, [v.id]: val })); }}
                        disabled={!v}
                        placeholder={v ? "この回のメモ" : "未実施"}
                        className="min-h-0 w-full resize-none overflow-hidden rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-orange-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-300"
                      />
                    </div>
                  );
                }).reverse()}
              </div>
              <p className="mt-2 text-[11px] text-slate-400">日付は体幹教室の予約から自動。各回に自由にメモできます。</p>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
          <span className={`text-sm font-bold ${msg === "保存しました" ? "text-emerald-600" : "text-rose-600"}`}>{msg}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-bold text-slate-600 active:bg-slate-100">閉じる</button>
            <button onClick={save} disabled={saving || loading} className="rounded-lg bg-orange-600 px-6 py-2 text-sm font-bold text-white active:bg-orange-700 disabled:opacity-50">{saving ? "保存中…" : "保存"}</button>
          </div>
        </div>
      </div>
    </div>

    {/* 1回分の詳細ページ（トレーニング内容） */}
    {openVisit && (() => {
      const { v, no } = openVisit;
      return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-3">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpenVisit(null)} />
          <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-base font-bold text-slate-800">
                {name} <span className="text-sm font-bold text-orange-600">{no}回</span>
                <span className="ml-2 text-xs font-normal text-slate-400">{v.date.replace(/-/g, "/")}・{minToLabel(v.start_min)}</span>
              </h2>
              <button onClick={() => setOpenVisit(null)} className="rounded-lg px-2 py-1 text-slate-400 active:bg-slate-100">✕</button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <label className="mb-1 block text-xs font-bold text-orange-600">🏋 トレーニング内容</label>
              <AutoTextarea value={notes[v.id] ?? ""} onChange={(val) => setNotes((n) => ({ ...n, [v.id]: val }))}
                placeholder="この回のトレーニング内容を記入。例）ベア→ハイベア→フルスクワット" withBackspace
                className="min-h-[50vh] w-full resize-none overflow-hidden rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none" />
            </div>

            <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
              <span className={`text-sm font-bold ${msg === "保存しました" ? "text-emerald-600" : "text-rose-600"}`}>{msg}</span>
              <div className="flex gap-2">
                <button onClick={() => setOpenVisit(null)} className="rounded-lg border px-4 py-2 text-sm font-bold text-slate-600 active:bg-slate-100">閉じる</button>
                <button onClick={() => saveVisit(v.id)} disabled={saving} className="rounded-lg bg-orange-600 px-6 py-2 text-sm font-bold text-white active:bg-orange-700 disabled:opacity-50">{saving ? "保存中…" : "保存"}</button>
              </div>
            </div>
          </div>
        </div>
      );
    })()}
    </>
  );
}
