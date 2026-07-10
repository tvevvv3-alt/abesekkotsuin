import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import { getCurrentStaff } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getCurrentStaff();

  // ログイン済みだが staff 未登録＝院内スタッフとして未承認
  if (!staff) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 text-center">
        <div className="card max-w-sm">
          <h1 className="text-lg font-bold">アカウント未登録</h1>
          <p className="mt-2 text-sm text-gray-500">
            このアカウントはスタッフとして登録されていません。院長にお問い合わせください。
          </p>
        </div>
      </main>
    );
  }

  if (!staff.active) {
    redirect("/login");
  }

  return (
    <>
      <NavBar staff={staff} />
      <main className="mx-auto max-w-3xl px-4 py-5 pb-24">{children}</main>
    </>
  );
}
