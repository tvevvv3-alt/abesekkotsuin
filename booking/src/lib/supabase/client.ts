"use client";

import { createBrowserClient } from "@supabase/ssr";

// ブラウザ用 Supabase クライアント（患者予約・管理画面 共通）
// 予約名の変更などが別画面で行われても、常に最新を取得できるよう HTTP キャッシュを無効化（no-store）。
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: "no-store" }),
      },
    }
  );
}
