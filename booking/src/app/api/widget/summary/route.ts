import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// iPhoneのウィジェット（Scriptable）から叩く、予約サマリーAPI。
// 認証はクエリの ?token= と環境変数 WIDGET_TOKEN の一致で行う（管理ログイン不要）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WD = ["日", "月", "火", "水", "木", "金", "土"];

// 日本時間（JST）の今日 "YYYY-MM-DD"
function jstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function fmt(dateStr: string, startMin: number) {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const wd = WD[new Date(y, m - 1, d).getDay()];
  const hh = Math.floor(startMin / 60);
  const mm = startMin % 60;
  return { md: `${m}/${d}(${wd})`, time: `${hh}:${String(mm).padStart(2, "0")}` };
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const expected = (process.env.WIDGET_TOKEN || "").trim();
  if (!expected) return NextResponse.json({ ok: false, reason: "no WIDGET_TOKEN" }, { status: 500 });
  if (token !== expected) return NextResponse.json({ ok: false, reason: "auth" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, reason: "server" }, { status: 500 });

  const today = jstToday();
  const { data: apptsData } = await admin
    .from("appointments")
    .select("date, start_min, patient_name, service_name, staff_id, status")
    .eq("status", "booked")
    .gte("date", today)
    .order("date", { ascending: true })
    .order("start_min", { ascending: true })
    .limit(30);
  const appts = (apptsData as Array<{
    date: string;
    start_min: number;
    patient_name: string | null;
    service_name: string | null;
    staff_id: string | null;
  }>) ?? [];

  const { data: staffData } = await admin.from("staff").select("id, name, display_name");
  const staffMap = new Map(
    ((staffData as Array<{ id: string; name: string | null; display_name: string | null }>) ?? []).map(
      (s) => [s.id, s.display_name || s.name || ""]
    )
  );

  const todayCount = appts.filter((a) => a.date === today).length;
  const upcoming = appts.slice(0, 10).map((a) => {
    const f = fmt(a.date, a.start_min);
    return {
      md: f.md,
      time: f.time,
      name: a.patient_name || "",
      service: a.service_name || "",
      staff: a.staff_id ? staffMap.get(a.staff_id) || "" : "",
      isToday: a.date === today,
    };
  });

  return NextResponse.json({
    ok: true,
    today,
    todayCount,
    upcoming,
    generatedAt: new Date().toISOString(),
  });
}
