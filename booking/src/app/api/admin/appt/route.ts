import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// クリックした予約1件だけを「サーバー経由で常に最新」取得する（軽量）。
// ブラウザのキャッシュで古い予約名を読んで別人を開く問題を、負荷なく防ぐため。
// 管理者ログイン必須。GET /api/admin/appt?id=<appointment_id>
export async function GET(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "auth" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ ok: false, reason: "id" }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, reason: "server" }, { status: 500 });

  const { data } = await admin
    .from("appointments")
    .select("id, patient_id, patient_name, date, start_min, end_min, status, service_id, service_name, staff_id")
    .eq("id", id)
    .maybeSingle();

  return NextResponse.json({ ok: true, appt: data ?? null }, { headers: { "cache-control": "no-store, max-age=0" } });
}
