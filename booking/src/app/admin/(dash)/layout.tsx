import AdminNav from "@/components/AdminNav";

export default function DashLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-100">
      <AdminNav />
      <main className="mx-auto max-w-5xl px-4 py-4">{children}</main>
    </div>
  );
}
