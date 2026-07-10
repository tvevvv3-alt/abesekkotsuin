import { notFound, redirect } from "next/navigation";
import PatientForm from "@/components/PatientForm";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/auth";
import { canEditPatient } from "@/lib/constants";
import type { Patient, Staff } from "@/lib/types";

export default async function EditPatientPage({
  params,
}: {
  params: { id: string };
}) {
  const staff = await getCurrentStaff();
  if (!canEditPatient(staff?.role)) redirect(`/patients/${params.id}`);

  const supabase = createClient();
  const [{ data: patient }, { data: staffList }] = await Promise.all([
    supabase.from("patients").select("*").eq("id", params.id).maybeSingle<Patient>(),
    supabase.from("staff").select("*").eq("active", true).order("name"),
  ]);

  if (!patient) notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">基本情報の編集</h1>
      <PatientForm staffList={(staffList as Staff[]) ?? []} initial={patient} />
    </div>
  );
}
