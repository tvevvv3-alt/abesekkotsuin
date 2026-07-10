"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ChipGroup from "@/components/ChipGroup";
import { MACHINES, METHODS, CHART_TYPE_LABELS } from "@/lib/constants";
import type { Chart, ChartData, ChartType, Treatments } from "@/lib/types";

// カルテ種別ごとの記述項目（jsonb data のキー）
const INITIAL_FIELDS: { key: keyof ChartData; label: string; area?: boolean }[] = [
  { key: "chief_complaint", label: "主訴", area: true },
  { key: "injury_date", label: "受傷日" },
  { key: "injury_mechanism", label: "受傷機転", area: true },
  { key: "hospital_history", label: "病院受診歴" },
  { key: "diagnosis", label: "診断名" },
  { key: "imaging_history", label: "画像検査歴" },
  { key: "tenderness", label: "圧痛" },
  { key: "swelling", label: "腫脹" },
  { key: "heat", label: "熱感" },
  { key: "bruising", label: "内出血" },
  { key: "rom", label: "ROM" },
  { key: "muscle_strength", label: "筋力" },
  { key: "special_test", label: "スペシャルテスト", area: true },
  { key: "echo_finding", label: "エコー所見", area: true },
  { key: "assessment", label: "評価", area: true },
  { key: "treatment_plan", label: "施術計画", area: true },
  { key: "return_estimate", label: "競技復帰目安" },
  { key: "next_check", label: "次回確認事項", area: true },
];

const FOLLOWUP_FIELDS: { key: keyof ChartData; label: string; area?: boolean }[] = [
  { key: "change_from_last", label: "前回からの変化", area: true },
  { key: "tenderness", label: "圧痛" },
  { key: "swelling", label: "腫脹" },
  { key: "rom", label: "ROM" },
  { key: "practice_status", label: "練習参加状況" },
  { key: "post_treatment_change", label: "施術後の変化", area: true },
  { key: "self_care", label: "セルフケア", area: true },
  { key: "next_check", label: "次回確認事項", area: true },
];

export default function ChartForm({
  patientId,
  chartType,
  initial,
}: {
  patientId: string;
  chartType: ChartType;
  initial?: Chart;
}) {
  const router = useRouter();
  const fields = chartType === "initial" ? INITIAL_FIELDS : FOLLOWUP_FIELDS;

  const [visitDate, setVisitDate] = useState(
    initial?.visit_date ?? new Date().toISOString().slice(0, 10)
  );
  const [pain, setPain] = useState<number | null>(initial?.pain_score ?? null);
  const [treatments, setTreatments] = useState<Treatments>(
    initial?.treatments ?? { machines: [], methods: [], other: "" }
  );
  const [data, setData] = useState<ChartData>(initial?.data ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setField(key: keyof ChartData, value: string) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const payload = {
      patient_id: patientId,
      chart_type: chartType,
      visit_date: visitDate,
      pain_score: pain,
      treatments,
      data,
      author_id: user?.id,
    };

    const res = initial
      ? await supabase.from("charts").update(payload).eq("id", initial.id)
      : await supabase.from("charts").insert(payload);

    if (res.error) {
      setError(res.error.message);
      setSaving(false);
      return;
    }
    router.replace(`/patients/${patientId}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* 来院日 */}
      <div className="card grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">来院日</label>
          <input
            type="date"
            className="field"
            value={visitDate}
            onChange={(e) => setVisitDate(e.target.value)}
            required
          />
        </div>
      </div>

      {/* 疼痛スコア */}
      <div className="card">
        <label className="label">疼痛スコア（0〜10）</label>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 11 }).map((_, n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPain(pain === n ? null : n)}
              className={`h-10 w-10 rounded-full text-sm font-semibold transition active:scale-95 ${
                pain === n
                  ? "bg-brand text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* 施術内容チップ */}
      <div className="card space-y-4">
        <div>
          <label className="label">機器</label>
          <ChipGroup
            options={MACHINES}
            selected={treatments.machines}
            onChange={(machines) => setTreatments((t) => ({ ...t, machines }))}
          />
        </div>
        <div>
          <label className="label">施術</label>
          <ChipGroup
            options={METHODS}
            selected={treatments.methods}
            onChange={(methods) => setTreatments((t) => ({ ...t, methods }))}
          />
          <input
            className="field mt-2"
            placeholder="その他（自由入力）"
            value={treatments.other}
            onChange={(e) =>
              setTreatments((t) => ({ ...t, other: e.target.value }))
            }
          />
        </div>
      </div>

      {/* 所見・評価 */}
      <div className="card grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className={f.area ? "sm:col-span-2" : ""}>
            <label className="label">{f.label}</label>
            {f.area ? (
              <textarea
                className="field min-h-20"
                value={data[f.key] ?? ""}
                onChange={(e) => setField(f.key, e.target.value)}
              />
            ) : (
              <input
                className="field"
                value={data[f.key] ?? ""}
                onChange={(e) => setField(f.key, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="btn-ghost flex-1"
        >
          キャンセル
        </button>
        <button type="submit" className="btn-primary flex-1" disabled={saving}>
          {saving ? "保存中…" : `${CHART_TYPE_LABELS[chartType]}カルテを保存`}
        </button>
      </div>
    </form>
  );
}
