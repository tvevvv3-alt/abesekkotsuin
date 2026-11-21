import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 診断用：指定日の予約(appointments)と売上(sales)の氏名を突き合わせて返す。
// 予約一覧で直した名前がどこに保存されているか（appointments.patient_name か sales.patient_name か）を確認するため。
// 管理者ログイン必須。GET /api/admin/debug-appts?date=2026-11-21
export async function GET(req: NextRequest) {
  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "auth" }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, reason: "date（?date=YYYY-MM-DD）" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, reason: "server" }, { status: 500 });

  const { data: appts } = await admin
    .from("appointments")
    .select("id, start_min, status, patient_id, patient_name")
    .eq("date", date)
    .neq("status", "cancelled")
    .order("start_min");

  const { data: sales } = await admin
    .from("sales")
    .select("id, appointment_id, patient_name, staff_id")
    .eq("date", date);

  const salesByAppt = new Map<string, string | null>();
  (sales || []).forEach((s) => { if (s.appointment_id) salesByAppt.set(s.appointment_id, s.patient_name); });

  const rows = (appts || []).map((a) => ({
    time: `${String(Math.floor(a.start_min / 60)).padStart(2, "0")}:${String(a.start_min % 60).padStart(2, "0")}`,
    appt_name: a.patient_name,         // 予約テーブルの氏名（カルテ・個別売上の予約行が読む）
    sale_name: salesByAppt.get(a.id) ?? null, // 売上テーブルの氏名
    patient_id: a.patient_id,
  }));

  return NextResponse.json({ ok: true, date, count: rows.length, rows });
}
