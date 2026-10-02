"use client";

import { useEffect } from "react";

// 下から出るポップアップ（スマホで片手操作しやすい形）
export default function Sheet({
  title,
  onClose,
  children,
  z = "z-50",
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  z?: string;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className={`fixed inset-0 ${z} flex items-end justify-center`}>
      <div className="absolute inset-0 bg-black/35" onClick={onClose} />
      <div className="sheet-enter relative flex max-h-[88dvh] w-full max-w-xl flex-col rounded-t-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="text-lg font-extrabold">{title}</div>
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-lg"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-10 pt-4">{children}</div>
      </div>
    </div>
  );
}
