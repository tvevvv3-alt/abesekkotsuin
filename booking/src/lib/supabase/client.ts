"use client";

import { createBrowserClient } from "@supabase/ssr";

// ブラウザ用 Supabase クライアント（患者予約・管理画面 共通）
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
