"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { createClient } from "@/lib/supabase/client";
import { minToLabel } from "@/lib/booking";

const PER_COURSE = 8; // 8回で1クール

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
  const [memo, setMemo] = useState("");
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
    // 各回メモ（テーブル未作成でも落ちない）
    const nm: Record<string, string> = {};
    const ids = vs.map((v) => v.id);
    if (ids.length) {
      const { data: cn, error } = await supabase.from("class_notes").select("appointment_id, note").in("appointment_id", ids);
      if (!error) ((cn as { appointment_id: string; note: string | null }[] | null) ?? []).forEach((r) => { nm[r.appointment_id] = r.note ?? ""; });
    }
    setNotes(nm);
    // 全体メモ
    const { data: mem } = await supabase.from("class_members").select("note").eq("name", name).maybeSingle();
    setMemo((mem as { note: string | null } | null)?.note ?? "");
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

  async function save() {
    setSaving(true);
    setMsg(null);
    let err: string | null = null;
    // 各回メモ（予約に紐づくものだけ）
    const rows = Object.entries(notes)
      .filter(([, v]) => v !== undefined)
      .map(([appointment_id, note]) => ({ appointment_id, note: note.trim() || null, updated_at: new Date().toISOString() }));
    if (rows.length) {
      const { error } = await supabase.from("class_notes").upsert(rows, { onConflict: "appointment_id" });
      if (error) err = "各回メモの保存に失敗（class_notes の作成が必要です）";
    }
    // 全体メモ（会員台帳）
    const { error: e2 } = await supabase.from("class_members").upsert({ name, note: memo.trim() || null }, { onConflict: "name" });
    if (e2 && !err) err = "全体メモの保存に失敗しました";
    setSaving(false);
    setMsg(err ?? "保存しました");
  }

  return (
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
              {/* 全体メモ */}
              <div className="mb-3">
                <label className="mb-1 block text-xs font-bold text-slate-500">メモ（目標・申し送りなど）</label>
                <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2}
                  className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none" />
              </div>

              {/* クール切替 */}
              {courses > 1 && (
                <div className="mb-2 flex items-center justify-center gap-3 text-sm">
                  <button onClick={() => setCourse((c) => Math.max(0, c - 1))} disabled={course === 0} className="rounded-lg border px-3 py-1 font-bold text-slate-600 disabled:opacity-40">‹</button>
                  <span className="font-bold text-slate-700">クール {course + 1} / {courses}</span>
                  <button onClick={() => setCourse((c) => Math.min(courses - 1, c + 1))} disabled={course >= courses - 1} className="rounded-lg border px-3 py-1 font-bold text-slate-600 disabled:opacity-40">›</button>
                </div>
              )}

              {/* 8回枠 */}
              <div className="divide-y rounded-xl border">
                {slots.map((v, i) => {
                  const no = course * PER_COURSE + i + 1;
                  return (
                    <div key={i} className="flex items-start gap-2 p-2">
                      <div className="w-10 shrink-0 pt-1 text-center">
                        <div className="text-[10px] font-bold text-orange-500">{no}回</div>
                        <div className="mt-0.5 whitespace-nowrap text-[10px] text-slate-500">
                          {v ? `${v.date.slice(5).replace("-", "/")}` : "—"}
                        </div>
                        {v && <div className="text-[9px] text-slate-400">{minToLabel(v.start_min)}</div>}
                      </div>
                      <textarea
                        value={v ? (notes[v.id] ?? "") : ""}
                        onChange={(e) => { if (v) setNotes((n) => ({ ...n, [v.id]: e.target.value })); }}
                        disabled={!v}
                        placeholder={v ? "この回のメモ" : "未実施"}
                        rows={2}
                        className="min-h-0 w-full resize-y rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-orange-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-300"
                      />
                    </div>
                  );
                })}
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
  );
}
