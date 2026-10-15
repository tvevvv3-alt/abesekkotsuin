"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// 管理画面の右下に出す「公式LINEを開く」フローティングボタン。
// 設定(settings.line_oa_url)にURLが入っているときだけ表示。
export default function LineFab() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const sb = createClient();
        const { data, error } = await sb.from("settings").select("line_oa_url").eq("id", 1).maybeSingle();
        if (error) return;
        const u = (data as { line_oa_url?: string | null } | null)?.line_oa_url;
        if (u && u.trim()) setUrl(u.trim());
      } catch { /* 未設定/未マイグレーションなら非表示 */ }
    })();
  }, []);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title="LINE応対（公式アカウント管理）を開く"
      aria-label="LINE応対（公式アカウント管理）を開く"
      className="fixed bottom-5 right-5 z-40 flex items-center justify-center rounded-full ring-1 ring-black/5 transition hover:brightness-105 active:scale-95"
      style={{ height: 52, width: 52, backgroundColor: "#06C755", boxShadow: "0 8px 22px rgba(6,199,85,.45)" }}
    >
      {/* クリーンなチャットバブル */}
      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#fff"
          d="M12 3.2C6.9 3.2 3 6.5 3 10.6c0 2.3 1.3 4.4 3.4 5.8.2.1.3.3.2.6l-.5 1.9c-.1.4.3.7.6.5l2.3-1.4c.2-.1.4-.1.6-.1.7.1 1.3.2 2 .2 5.1 0 9-3.3 9-7.4S17.1 3.2 12 3.2Z"
        />
        <g fill="#06C755">
          <circle cx="8.6" cy="10.6" r="1.05" />
          <circle cx="12" cy="10.6" r="1.05" />
          <circle cx="15.4" cy="10.6" r="1.05" />
        </g>
      </svg>
    </a>
  );
}
