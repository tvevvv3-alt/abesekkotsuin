import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ChartForm from "@/components/ChartForm";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/auth";
import { canWriteChart, CHART_TYPE_LABELS } from "@/lib/constants";
import type { Chart } from "@/lib/types";

export default async function EditChartPage({
  params,
}: {
  params: { id: string; chartId: string };
}) {
  const staff = await getCurrentStaff();
  if (!canWriteChart(staff?.role))
    redirect(`/patients/${params.id}/charts/${params.chartId}`);

  const supabase = createClient();
  const { data: chart } = await supabase
    .from("charts")
    .select("*")
    .eq("id", params.chartId)
    .maybeSingle<Chart>();

  if (!chart) notFound();

  return (
    <div className="space-y-4">
      <Link
        href={`/patients/${params.id}/charts/${params.chartId}`}
        className="text-sm text-gray-400"
      >
        ‹ カルテ詳細
      </Link>
      <h1 className="text-lg font-bold">
        {CHART_TYPE_LABELS[chart.chart_type]}カルテの編集
      </h1>
      <ChartForm
        patientId={params.id}
        chartType={chart.chart_type}
        initial={chart}
      />
    </div>
  );
}
