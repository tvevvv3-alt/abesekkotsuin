import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// カルテ用の予約＋患者台帳を「サーバー経由で常に最新」取得する。
// ブラウザ側のHTTPキャッシュに左右されず、予約一覧で直した名前を確実に反映するため。
// 管理者ログイン必須。GET /api/admin/chart-data
export async function GET() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "auth" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, reason: "server" }, { status: 500 });

  // 予約（キャンセル除く）を全件（1000件ずつページング）。日付降順。
  const PAGE = 1000;
  const appts: Record<string, unknown>[] = [];
  for (let i = 0; i < 40; i++) {
    const { data, error } = await admin
      .from("appointments")
      .select("id, patient_id, patient_name, date, start_min, end_min, status, service_id, service_name, staff_id")
      .neq("status", "cancelled")
      .order("date", { ascending: false })
      .range(i * PAGE, i * PAGE + PAGE - 1);
    if (error || !data || data.length === 0) break;
    appts.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE) break;
  }

  const patients: Record<string, unknown>[] = [];
  for (let i = 0; i < 40; i++) {
    const { data, error } = await admin
      .from("patients")
      .select("id, name, name_kana, birth_date, phone, chart_note")
      .order("name")
      .range(i * PAGE, i * PAGE + PAGE - 1);
    if (error || !data || data.length === 0) break;
    patients.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE) break;
  }

  return NextResponse.json(
    { ok: true, appts, patients },
    { headers: { "cache-control": "no-store, max-age=0" } }
  );
}
