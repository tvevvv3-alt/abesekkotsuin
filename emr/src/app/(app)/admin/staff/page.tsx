import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/auth";
import StaffAdmin from "@/components/StaffAdmin";

export default async function StaffAdminPage() {
  const staff = await getCurrentStaff();
  if (staff?.role !== "director") redirect("/patients");
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">スタッフ管理</h1>
      <StaffAdmin />
    </div>
  );
}
