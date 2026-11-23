import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 指定1日分の予約だけを「サーバー経由で常に最新」取得する（軽量＝数十件）。
// 「次の人」の並びがその日の最新の予約名で正しく作られるようにするため。
// 管理者ログイン必須。GET /api/admin/appts-day?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "auth" }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ ok: false, reason: "date" }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, reason: "server" }, { status: 500 });

  const { data } = await admin
    .from("appointments")
    .select("id, patient_id, patient_name, date, start_min, end_min, status, service_id, service_name, staff_id")
    .eq("date", date)
    .neq("status", "cancelled")
    .order("start_min");

  return NextResponse.json({ ok: true, appts: data ?? [] }, { headers: { "cache-control": "no-store, max-age=0" } });
}
