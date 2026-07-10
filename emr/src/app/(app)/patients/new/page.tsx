import { redirect } from "next/navigation";
import PatientForm from "@/components/PatientForm";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/auth";
import { canEditPatient } from "@/lib/constants";
import type { Staff } from "@/lib/types";

export default async function NewPatientPage() {
  const staff = await getCurrentStaff();
  if (!canEditPatient(staff?.role)) {
    redirect("/patients");
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("staff")
    .select("*")
    .eq("active", true)
    .order("name");

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">患者新規登録</h1>
      <PatientForm staffList={(data as Staff[]) ?? []} />
    </div>
  );
}
