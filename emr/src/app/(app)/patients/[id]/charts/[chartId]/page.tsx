import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/auth";
import {
  CHART_TYPE_LABELS,
  canWriteChart,
  MODALITY_MAP,
  OTHER_MODALITY,
} from "@/lib/constants";
import type { Chart, ChartData, Staff } from "@/lib/types";

const LABELS: Partial<Record<keyof ChartData, string>> = {
  main_symptoms: "主な症状",
  chief_complaint: "主訴",
  injury_date: "受傷日",
  injury_mechanism: "受傷機転",
  hospital_history: "病院受診歴",
  diagnosis: "診断名",
  imaging_history: "画像検査歴",
  tenderness: "圧痛",
  swelling: "腫脹",
  heat: "熱感",
  bruising: "内出血",
  rom: "ROM",
  muscle_strength: "筋力",
  special_test: "スペシャルテスト",
  echo_finding: "エコー所見",
  assessment: "評価",
  treatment_plan: "施術計画",
  return_estimate: "競技復帰目安",
  change_from_last: "前回からの変化",
  practice_status: "練習参加状況",
  post_treatment_change: "施術後の変化",
  self_care: "セルフケア",
  next_check: "次回確認事項",
};

export default async function ChartDetailPage({
  params,
}: {
  params: { id: string; chartId: string };
}) {
  const staff = (await getCurrentStaff())!;
  const supabase = createClient();

  const { data: chart } = await supabase
    .from("charts")
    .select("*")
    .eq("id", params.chartId)
    .maybeSingle<Chart>();

  if (!chart) notFound();

  let author = "";
  if (chart.author_id) {
    const { data } = await supabase
      .from("staff")
      .select("name")
      .eq("id", chart.author_id)
      .maybeSingle<Pick<Staff, "name">>();
    author = data?.name ?? "";
  }

  const caseType = chart.data?.case_type;
  const entries = Object.entries(chart.data ?? {}).filter(
    ([k, v]) => k !== "case_type" && v && String(v).trim()
  ) as [keyof ChartData, string][];

  const approach = chart.treatments?.approach ?? "";
  const treatItems = chart.treatments?.items ?? [];
  const sites = chart.sites ?? [];

  return (
    <div className="space-y-5">
      <Link href={`/patients/${params.id}`} className="text-sm text-gray-400">
        ‹ 患者詳細
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              chart.chart_type === "initial"
                ? "bg-brand/10 text-brand"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {CHART_TYPE_LABELS[chart.chart_type]}
          </span>
          {caseType && (
            <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
              {caseType}
            </span>
          )}
          <h1 className="mt-1 text-xl font-bold">{chart.visit_date}</h1>
          <p className="text-xs text-gray-500">担当: {author || "―"}</p>
        </div>
        {canWriteChart(staff.role) && (
          <Link
            href={`/patients/${params.id}/charts/${chart.id}/edit`}
            className="btn-ghost text-sm"
          >
            編集
          </Link>
        )}
      </div>

      {sites.length > 0 && (
        <section className="card">
          <h2 className="mb-3 text-sm font-bold text-gray-500">
            疼痛スコア（施術前 → 施術後）
          </h2>
          <ul className="space-y-2">
            {sites.map((s, i) => {
              const diff =
                s.pain_pre != null && s.pain_post != null
                  ? s.pain_post - s.pain_pre
                  : null;
              return (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2 text-sm"
                >
                  <span className="font-medium">{s.name || `部位${i + 1}`}</span>
                  <span className="flex items-center gap-2 tabular-nums">
                    <span className="text-gray-500">
                      前 {s.pain_pre ?? "―"}
                    </span>
                    <span className="text-gray-300">→</span>
                    <span className="font-semibold text-brand">
                      後 {s.pain_post ?? "―"}
                    </span>
                    {diff != null && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          diff <= 0
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-600"
                        }`}
                      >
                        {diff > 0 ? `+${diff}` : diff}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {treatItems.length > 0 && (
        <section className="card space-y-3">
          <h2 className="text-sm font-bold text-gray-500">施術内容</h2>
          <ul className="space-y-2">
            {treatItems.map((it, i) => {
              const def = MODALITY_MAP[it.modality];
              const name =
                it.modality === OTHER_MODALITY
                  ? it.label || "その他"
                  : it.modality;
              const parts: string[] = [];
              const detailFields = def?.fields ?? [
                { key: "content" as const, label: "内容" },
              ];
              for (const f of detailFields) {
                const v = it[f.key];
                if (v && String(v).trim()) parts.push(`${f.label}: ${v}`);
              }
              return (
                <li
                  key={i}
                  className="rounded-xl bg-gray-50 px-3 py-2 text-sm"
                >
                  <span className="font-semibold text-brand">{name}</span>
                  {parts.length > 0 && (
                    <span className="ml-2 whitespace-pre-wrap text-gray-700">
                      {parts.join(" ／ ")}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {approach && (
        <section className="card">
          <h2 className="mb-2 text-sm font-bold text-gray-500">
            効果的だったアプローチ
          </h2>
          <p className="whitespace-pre-wrap text-sm">{approach}</p>
        </section>
      )}

      <section className="card">
        <h2 className="mb-3 text-sm font-bold text-gray-500">所見・評価</h2>
        {entries.length === 0 ? (
          <p className="text-sm text-gray-400">記入なし</p>
        ) : (
          <dl className="space-y-3">
            {entries.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-gray-500">{LABELS[k] ?? k}</dt>
                <dd className="whitespace-pre-wrap text-sm">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  );
}
