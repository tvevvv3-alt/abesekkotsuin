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
      className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition active:scale-95"
      style={{ backgroundColor: "#06C755" }}
    >
      <svg viewBox="0 0 48 48" width="30" height="30" aria-hidden="true">
        <path
          fill="#fff"
          d="M24 8C13.5 8 5 15 5 23.6c0 7.7 6.7 14.1 15.8 15.3.6.1 1.4.4 1.6.9.2.5.1 1.2.1 1.7l-.2 1.6c-.1.5-.4 1.9 1.7 1 2.1-.9 11.2-6.6 15.3-11.3C42.9 31 45 27.5 45 23.6 45 15 36.5 8 24 8Z"
        />
        <g fill="#06C755">
          <rect x="15.5" y="20" width="1.9" height="8" rx=".9" />
          <path d="M20 20.9c0-.5.4-.9.9-.9s.9.4.9.9v4.7l3.1-5.1c.2-.3.5-.5.8-.5.5 0 .9.4.9.9v6.2c0 .5-.4.9-.9.9s-.9-.4-.9-.9v-4.6l-3.1 5c-.2.3-.5.5-.8.5-.5 0-.9-.4-.9-.9v-6.2Z" />
          <path d="M28.5 20.9c0-.5.4-.9.9-.9h3.3c.5 0 .9.4.9.9s-.4.9-.9.9h-2.4v1.3h2.4c.5 0 .9.4.9.9s-.4.9-.9.9h-2.4v1.3h2.4c.5 0 .9.4.9.9s-.4.9-.9.9h-3.3c-.5 0-.9-.4-.9-.9v-6.2Z" />
        </g>
      </svg>
    </a>
  );
}
