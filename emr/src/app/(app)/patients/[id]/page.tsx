import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/auth";
import {
  SEX_LABELS,
  CHART_TYPE_LABELS,
  canEditPatient,
  canWriteChart,
  canDelete,
} from "@/lib/constants";
import ImageManager from "@/components/ImageManager";
import DeletePatientButton from "@/components/DeletePatientButton";
import type { Patient, Chart, Staff } from "@/lib/types";

export default async function PatientDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const staff = (await getCurrentStaff())!;
  const supabase = createClient();

  const { data: patient } = await supabase
    .from("patients")
    .select("*")
    .eq("id", params.id)
    .maybeSingle<Patient>();

  if (!patient) notFound();

  const [{ data: charts }, { data: staffList }] = await Promise.all([
    supabase
      .from("charts")
      .select("*")
      .eq("patient_id", params.id)
      .order("visit_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("staff").select("id,name"),
  ]);

  const staffMap = new Map(
    ((staffList as Pick<Staff, "id" | "name">[]) ?? []).map((s) => [s.id, s.name])
  );

  const info: [string, string | null][] = [
    ["フリガナ", patient.name_kana],
    ["生年月日", patient.birth_date],
    ["性別", patient.sex ? SEX_LABELS[patient.sex] : null],
    ["電話番号", patient.phone],
    ["住所", patient.address],
    ["学校", patient.school],
    ["所属チーム", patient.team],
    ["競技", patient.sport],
    ["ポジション", patient.position],
    ["保護者氏名", patient.guardian_name],
    ["保護者連絡先", patient.guardian_contact],
    ["担当スタッフ", patient.assigned_staff_id ? staffMap.get(patient.assigned_staff_id) ?? null : null],
    ["初回来院日", patient.first_visit_date],
    ["既往歴", patient.medical_history],
    ["アレルギー", patient.allergies],
  ];

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/patients" className="text-sm text-gray-400">
            ‹ 患者一覧
          </Link>
          <h1 className="mt-1 text-xl font-bold">{patient.name}</h1>
          <p className="text-xs text-gray-500">ID {patient.patient_number}</p>
        </div>
        {canEditPatient(staff.role) && (
          <Link
            href={`/patients/${patient.id}/edit`}
            className="btn-ghost text-sm"
          >
            基本情報を編集
          </Link>
        )}
      </div>

      {/* カルテ作成ボタン */}
      {canWriteChart(staff.role) && (
        <div className="grid grid-cols-2 gap-3">
          <Link
            href={`/patients/${patient.id}/charts/new?type=initial`}
            className="btn-primary"
          >
            初診カルテ
          </Link>
          <Link
            href={`/patients/${patient.id}/charts/new?type=followup`}
            className="btn-ghost"
          >
            再診カルテ
          </Link>
        </div>
      )}

      {/* 基本情報 */}
      <section className="card">
        <h2 className="mb-3 text-sm font-bold text-gray-500">基本情報</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {info.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-gray-50 py-1.5 text-sm">
              <dt className="text-gray-500">{k}</dt>
              <dd className="text-right font-medium">{v || "―"}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* カルテ履歴 */}
      {canWriteChart(staff.role) && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-gray-500">過去カルテ一覧</h2>
          {!charts || charts.length === 0 ? (
            <p className="text-sm text-gray-400">カルテはまだありません</p>
          ) : (
            <ul className="space-y-2">
              {(charts as Chart[]).map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/patients/${patient.id}/charts/${c.id}`}
                    className="card flex items-center justify-between hover:bg-gray-50"
                  >
                    <div>
                      <span
                        className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          c.chart_type === "initial"
                            ? "bg-brand/10 text-brand"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {CHART_TYPE_LABELS[c.chart_type]}
                      </span>
                      <span className="font-medium">{c.visit_date}</span>
                      {c.sites?.[0] && (
                        <span className="ml-2 text-xs text-gray-500">
                          {c.sites[0].name || "疼痛"} {c.sites[0].pain_pre ?? "―"}→
                          {c.sites[0].pain_post ?? "―"}
                          {c.sites.length > 1 && ` 他${c.sites.length - 1}部位`}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">
                      {c.author_id ? staffMap.get(c.author_id) : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* 画像（時系列） */}
      {canWriteChart(staff.role) && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-gray-500">
            エコー画像・患部写真（時系列）
          </h2>
          <ImageManager patientId={patient.id} role={staff.role} />
        </section>
      )}

      {canDelete(staff.role) && (
        <div className="pt-4 text-center">
          <DeletePatientButton id={patient.id} />
        </div>
      )}
    </div>
  );
}
