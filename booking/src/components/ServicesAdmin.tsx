"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadEquipment, loadServices } from "@/lib/data";
import type { Equipment, ServiceWithSteps } from "@/lib/types";
import { totalDuration } from "@/lib/booking";

interface StepDraft {
  name: string;
  duration_min: number;
  uses_staff: boolean;
  equipment_id: string; // "" = なし
  headcount: number;
}

const emptyStep = (): StepDraft => ({
  name: "",
  duration_min: 30,
  uses_staff: true,
  equipment_id: "",
  headcount: 1,
});

export default function ServicesAdmin() {
  const supabase = useMemo(() => createClient(), []);
  const [services, setServices] = useState<ServiceWithSteps[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<ServiceWithSteps | "new" | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [rec, setRec] = useState(false);
  const [steps, setSteps] = useState<StepDraft[]>([emptyStep()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const [sv, eq] = await Promise.all([
      loadServices(supabase),
      loadEquipment(supabase),
    ]);
    setServices(sv);
    setEquipment(eq);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    reload();
  }, [reload]);

  function openNew() {
    setEditing("new");
    setName("");
    setDesc("");
    setRec(false);
    setSteps([emptyStep()]);
    setError(null);
  }

  function openEdit(s: ServiceWithSteps) {
    setEditing(s);
    setName(s.name);
    setDesc(s.description || "");
    setRec(s.recommended);
    setSteps(
      s.steps.map((st) => ({
        name: st.name,
        duration_min: st.duration_min,
        uses_staff: st.uses_staff,
        equipment_id: st.equipment_id || "",
        headcount: st.headcount,
      }))
    );
    setError(null);
  }

  function updateStep(i: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function save() {
    if (!name.trim()) {
      setError("メニュー名を入力してください");
      return;
    }
    if (steps.length === 0 || steps.some((s) => !s.name.trim() || s.duration_min <= 0)) {
      setError("各工程の名称と所要時間（分）を入力してください");
      return;
    }
    if (steps.some((s) => s.duration_min % 5 !== 0)) {
      setError("所要時間は5分単位で入力してください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let serviceId: string;
      if (editing === "new") {
        const { data, error } = await supabase
          .from("services")
          .insert({
            name: name.trim(),
            description: desc.trim() || null,
            recommended: rec,
            sort_order: rec ? 0 : services.length + 1,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        serviceId = data.id;
      } else if (editing) {
        serviceId = editing.id;
        const { error } = await supabase
          .from("services")
          .update({ name: name.trim(), description: desc.trim() || null, recommended: rec })
          .eq("id", serviceId);
        if (error) throw new Error(error.message);
        await supabase.from("service_steps").delete().eq("service_id", serviceId);
      } else {
        return;
      }

      const rows = steps.map((s, i) => ({
        service_id: serviceId,
        step_order: i + 1,
        name: s.name.trim(),
        duration_min: s.duration_min,
        uses_staff: s.uses_staff,
        equipment_id: s.equipment_id || null,
        headcount: s.headcount,
      }));
      const { error: stepErr } = await supabase.from("service_steps").insert(rows);
      if (stepErr) throw new Error(stepErr.message);

      setEditing(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラー");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(s: ServiceWithSteps) {
    await supabase.from("services").update({ active: !s.active }).eq("id", s.id);
    reload();
  }

  async function remove(s: ServiceWithSteps) {
    if (!confirm(`「${s.name}」を削除しますか？`)) return;
    await supabase.from("services").delete().eq("id", s.id);
    reload();
  }

  if (loading) return <p className="py-8 text-center text-sm text-slate-500">読み込み中…</p>;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">メニュー・工程設定</h1>
        <button
          onClick={openNew}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white"
        >
          ＋ 新規メニュー
        </button>
      </div>

      <div className="space-y-2">
        {services.map((s) => (
          <div
            key={s.id}
            className={`rounded-xl border bg-white p-3 ${s.active ? "" : "opacity-50"}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-bold text-slate-800">
                  {s.name}{" "}
                  {s.recommended && (
                    <span className="rounded-full bg-blue-600 px-2 py-0.5 align-middle text-[10px] font-bold text-white">
                      イチオシ
                    </span>
                  )}{" "}
                  <span className="text-xs font-normal text-slate-400">
                    約{totalDuration(s.steps)}分
                  </span>
                </div>
                {s.description && (
                  <div className="text-xs text-slate-500">{s.description}</div>
                )}
                <ol className="mt-1 space-y-0.5">
                  {s.steps.map((st) => (
                    <li key={st.id} className="text-xs text-slate-600">
                      {st.step_order}. {st.name}（{st.duration_min}分）
                      {st.uses_staff && " 担当者"}
                      {st.equipment_id &&
                        ` 機器:${equipment.find((e) => e.id === st.equipment_id)?.name || "?"}`}
                    </li>
                  ))}
                </ol>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                <button onClick={() => openEdit(s)} className="text-blue-600">
                  編集
                </button>
                <button onClick={() => toggleActive(s)} className="text-slate-500">
                  {s.active ? "非表示" : "表示"}
                </button>
                <button onClick={() => remove(s)} className="text-red-500">
                  削除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 編集フォーム */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-slate-800">
                {editing === "new" ? "新規メニュー" : "メニュー編集"}
              </h2>
              <button onClick={() => setEditing(null)} className="text-slate-400">
                ✕
              </button>
            </div>

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="メニュー名（例: 全身通電30分→施術30分）"
              className="mb-2 w-full rounded-md border px-2 py-1.5 text-sm"
            />
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="説明（任意）"
              rows={3}
              className="mb-2 w-full rounded-md border px-2 py-1.5 text-sm"
            />
            <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={rec}
                onChange={(e) => setRec(e.target.checked)}
              />
              イチオシとして表示（一覧で強調・先頭に表示）
            </label>

            <div className="mb-1 text-xs font-bold text-slate-600">
              工程（患者には表示されません。予約判定はこの順番で行います）
            </div>
            <div className="space-y-2">
              {steps.map((st, i) => (
                <div key={i} className="rounded-lg border p-2">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400">{i + 1}</span>
                    <input
                      value={st.name}
                      onChange={(e) => updateStep(i, { name: e.target.value })}
                      placeholder="工程名（例: 全身通電 / 施術）"
                      className="flex-1 rounded-md border px-2 py-1 text-sm"
                    />
                    {steps.length > 1 && (
                      <button
                        onClick={() => setSteps((p) => p.filter((_, x) => x !== i))}
                        className="text-xs text-red-500"
                      >
                        削除
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-1">
                      所要
                      <input
                        type="number"
                        min={5}
                        step={5}
                        value={st.duration_min}
                        onChange={(e) =>
                          updateStep(i, { duration_min: parseInt(e.target.value || "0", 10) })
                        }
                        className="w-16 rounded-md border px-1.5 py-1"
                      />
                      分
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={st.uses_staff}
                        onChange={(e) => updateStep(i, { uses_staff: e.target.checked })}
                      />
                      担当者を使用
                    </label>
                    <label className="flex items-center gap-1">
                      機器
                      <select
                        value={st.equipment_id}
                        onChange={(e) => updateStep(i, { equipment_id: e.target.value })}
                        className="rounded-md border px-1.5 py-1"
                      >
                        <option value="">なし</option>
                        {equipment.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {st.equipment_id && (
                      <label className="flex items-center gap-1">
                        利用人数
                        <input
                          type="number"
                          min={1}
                          value={st.headcount}
                          onChange={(e) =>
                            updateStep(i, { headcount: parseInt(e.target.value || "1", 10) })
                          }
                          className="w-14 rounded-md border px-1.5 py-1"
                        />
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setSteps((p) => [...p, emptyStep()])}
              className="mt-2 w-full rounded-md border border-dashed py-1.5 text-sm text-slate-500"
            >
              ＋ 工程を追加
            </button>

            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="rounded-lg border px-4 py-2 text-sm text-slate-600"
              >
                閉じる
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white disabled:bg-slate-300"
              >
                {busy ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
