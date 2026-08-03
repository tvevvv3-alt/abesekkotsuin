"use client";

import CoreEvalEditor from "@/components/CoreEvalEditor";

// 予約ボード／カレンダーの「体幹テスト」から開く、体幹評価の入力モーダル。
// 送信先LINE（lineUserId）を予約から受け取るので、送り先が確実。
export default function CoreEvalModal({
  name,
  lineUserId,
  onClose,
}: {
  name: string;
  lineUserId: string | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:p-6">
      <div className="relative w-full max-w-3xl rounded-2xl bg-slate-50 p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">体幹テスト（評価入力）</h2>
          <button onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-bold text-slate-600 active:bg-slate-100">
            閉じる
          </button>
        </div>
        <CoreEvalEditor name={name} lineUserId={lineUserId} />
      </div>
    </div>
  );
}
