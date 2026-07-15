"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadAllStaff } from "@/lib/data";
import type { Appointment, Patient, Staff } from "@/lib/types";
import { minToLabel } from "@/lib/booking";

const STATUS_JA: Record<string, string> = {
  booked: "予約",
  done: "来院済",
  cancelled: "取消",
};

export default function PatientsAdmin() {
  const supabase = useMemo(() => createClient(), []);
  const [term, setTerm] = useState("");
  const [list, setList] = useState<Patient[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [sel, setSel] = useState<Patient | null>(null);
  const [history, setHistory] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<Patient | "new" | null>(null);
  const [f, setF] = useState({ name: "", name_kana: "", birth_date: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const staffName = useCallback(
    (id: string | null) => (id ? staff.find((s) => s.id === id)?.display_name || staff.find((s) => s.id === id)?.name || "" : ""),
    [staff]
  );

  const search = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("patients").select("*").order("created_at", { ascending: false }).limit(50);
    const t = term.trim();
    if (t) q = q.or(`name.ilike.%${t}%,name_kana.ilike.%${t}%,phone.ilike.%${t}%`);
    const { data } = await q;
    setList(data ?? []);
    setLoading(false);
  }, [supabase, term]);

  useEffect(() => {
    (async () => {
      setStaff(await loadAllStaff(supabase));
      await search();
    })();
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function openDetail(p: Patient) {
    setSel(p);
    const { data } = await supabase
      .from("appointments")
      .select("*")
      .eq("patient_id", p.id)
      .order("date", { ascending: false })
      .order("start_min", { ascending: false });
    setHistory(data ?? []);
  }

  function openEdit(p: Patient | "new") {
    setEditing(p);
    setError(null);
    if (p === "new") setF({ name: "", name_kana: "", birth_date: "", phone: "" });
    else setF({ name: p.name, name_kana: p.name_kana || "", birth_date: p.birth_date || "", phone: p.phone || "" });
  }

  async function save() {
    if (!f.name.trim()) {
      setError("氏名を入力してください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editing === "new") {
        const { count } = await supabase.from("patients").select("id", { count: "exact", head: true });
        const num = "B" + String((count ?? 0) + 1).padStart(5, "0");
        const { error } = await supabase.from("patients").insert({
          patient_number: num,
          name: f.name.trim(),
          name_kana: f.name_kana.trim() || null,
          birth_date: f.birth_date || null,
          phone: f.phone.trim() || null,
        });
        if (error) throw new Error(error.message);
      } else if (editing) {
        const { error } = await supabase
          .from("patients")
          .update({
            name: f.name.trim(),
            name_kana: f.name_kana.trim() || null,
            birth_date: f.birth_date || null,
            phone: f.phone.trim() || null,
          })
          .eq("id", editing.id);
        if (error) throw new Error(error.message);
      }
      setEditing(null);
      await search();
      if (sel && editing !== "new") setSel({ ...sel, ...f, name_kana: f.name_kana || null, birth_date: f.birth_date || null, phone: f.phone || null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラー");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">患者管理</h1>
        <button onClick={() => openEdit("new")} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">
          ＋ 新患登録
        </button>
      </div>

      <div className="mb-3 flex gap-2">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="氏名・フリガナ・電話で検索"
          className="flex-1 rounded-lg border px-3 py-2 text-sm"
        />
        <button onClick={search} className="rounded-lg bg-slate-700 px-4 text-sm font-bold text-white">
          検索
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* 一覧 */}
        <div className="space-y-1.5">
          {loading ? (
            <p className="text-sm text-slate-500">読み込み中…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-slate-400">該当する患者がいません</p>
          ) : (
            list.map((p) => (
              <button
                key={p.id}
                onClick={() => openDetail(p)}
                className={`flex w-full items-center justify-between rounded-lg border bg-white px-3 py-2 text-left ${
                  sel?.id === p.id ? "border-blue-500 ring-1 ring-blue-200" : ""
                }`}
              >
                <div>
                  <div className="font-bold text-slate-800">{p.name}</div>
                  <div className="text-xs text-slate-400">
                    {p.name_kana} {p.phone}
                  </div>
                </div>
                <span className="text-[10px] text-slate-400">{p.patient_number}</span>
              </button>
            ))
          )}
        </div>

        {/* 詳細＋履歴 */}
        <div>
          {sel ? (
            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-bold text-slate-800">{sel.name}</div>
                  <div className="text-xs text-slate-500">{sel.name_kana}</div>
                  <dl className="mt-2 space-y-0.5 text-sm text-slate-600">
                    <div>患者番号：{sel.patient_number}</div>
                    <div>生年月日：{sel.birth_date || "—"}</div>
                    <div>電話：{sel.phone || "—"}</div>
                  </dl>
                </div>
                <button onClick={() => openEdit(sel)} className="text-sm text-blue-600">
                  編集
                </button>
              </div>

              <div className="mt-4">
                <div className="mb-1 text-sm font-bold text-slate-600">予約履歴</div>
                {history.length === 0 ? (
                  <p className="text-xs text-slate-400">予約はありません</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {history.map((a) => (
                      <li key={a.id} className="flex items-center justify-between py-1.5 text-sm">
                        <span className="tabnum text-slate-700">
                          {a.date} {minToLabel(a.start_min)}
                        </span>
                        <span className="flex-1 truncate px-2 text-xs text-slate-500">
                          {a.service_name}
                          {a.staff_id ? ` / ${staffName(a.staff_id)}` : ""}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${
                            a.status === "cancelled" ? "bg-slate-200 text-slate-500" : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {STATUS_JA[a.status] || a.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-slate-400">
              左の一覧から患者を選ぶと、詳細と予約履歴を表示します。
            </p>
          )}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-2xl bg-white p-4 sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-slate-800">{editing === "new" ? "新患登録" : "患者情報の編集"}</h2>
              <button onClick={() => setEditing(null)} className="text-slate-400">✕</button>
            </div>
            <div className="space-y-2">
              <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="氏名 *" className="w-full rounded-md border px-2 py-1.5 text-sm" />
              <input value={f.name_kana} onChange={(e) => setF({ ...f, name_kana: e.target.value })} placeholder="フリガナ" className="w-full rounded-md border px-2 py-1.5 text-sm" />
              <input type="date" value={f.birth_date} onChange={(e) => setF({ ...f, birth_date: e.target.value })} className="w-full rounded-md border px-2 py-1.5 text-sm" />
              <input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="電話番号" className="w-full rounded-md border px-2 py-1.5 text-sm" />
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-lg border px-4 py-2 text-sm text-slate-600">閉じる</button>
              <button onClick={save} disabled={busy} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white disabled:bg-slate-300">
                {busy ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
