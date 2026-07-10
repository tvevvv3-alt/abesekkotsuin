import Link from "next/link";
import { redirect } from "next/navigation";
import ChartForm from "@/components/ChartForm";
import { getCurrentStaff } from "@/lib/auth";
import { canWriteChart, CHART_TYPE_LABELS } from "@/lib/constants";
import type { ChartType } from "@/lib/types";

export default async function NewChartPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { type?: string };
}) {
  const staff = await getCurrentStaff();
  if (!canWriteChart(staff?.role)) redirect(`/patients/${params.id}`);

  const chartType: ChartType =
    searchParams.type === "followup" ? "followup" : "initial";

  return (
    <div className="space-y-4">
      <Link href={`/patients/${params.id}`} className="text-sm text-gray-400">
        ‹ 患者詳細
      </Link>
      <h1 className="text-lg font-bold">
        {CHART_TYPE_LABELS[chartType]}カルテ
      </h1>
      <ChartForm patientId={params.id} chartType={chartType} />
    </div>
  );
}
