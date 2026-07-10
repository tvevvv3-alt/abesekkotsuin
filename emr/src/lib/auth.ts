import { createClient } from "@/lib/supabase/server";
import type { Staff } from "@/lib/types";

// 現在ログイン中スタッフのプロフィールを取得（未登録なら null）
export async function getCurrentStaff(): Promise<Staff | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("staff")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return (data as Staff) ?? null;
}
