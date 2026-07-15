import BookingWizard from "@/components/BookingWizard";

// 患者予約画面（公開・スマホ優先）
export default function Page() {
  return (
    <main className="min-h-screen bg-slate-100">
      <BookingWizard />
    </main>
  );
}
