export default function ComingSoon({
  title,
  desc,
}: {
  title: string;
  desc: string;
}) {
  return (
    <div className="max-w-xl">
      <h1 className="mb-2 text-lg font-bold text-slate-800">{title}</h1>
      <div className="rounded-xl border border-dashed bg-white p-6 text-sm text-slate-500">
        <p className="mb-2 font-medium text-slate-600">この画面は次のフェーズで実装予定です。</p>
        <p className="leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
