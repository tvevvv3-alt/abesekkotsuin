import { createClient } from "@supabase/supabase-js";

// サーバー専用（サービスロール）クライアント。
// RLS を迂回して予約本体の更新・参照ができる。API ルートからのみ使うこと。
// 環境変数が無い場合は null を返し、呼び出し側で機能を無効化する。
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
