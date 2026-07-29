import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyLineUser } from "@/lib/line";
import { verifyState } from "@/lib/line-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 本人（LINE）の今後の予約一覧を返す。キャンセル/変更の可否も判定して返す。
export async function POST(req: NextRequest) {
  let idToken = "";
  try {
    idToken = ((await req.json()) as { idToken?: string }).idToken || "";
  } catch {
    /* noop */
  }
  // 本人特定：サーバーOAuthのCookie優先、無ければLIFFのidToken
  const cookieUid = (() => { const c = req.cookies.get("line_uid")?.value; return c ? verifyState(c) : null; })();
  const userId = cookieUid || (idToken ? await verifyLineUser(idToken) : null);
  if (!userId) return NextResponse.json({ ok: false, reason: "auth" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, reason: "server" }, { status: 500 });

  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // JSTの今日
  const [{ data: appts }, { data: cfg }, { data: staffRows }, { data: svcRows }] = await Promise.all([
    admin
      .from("appointments")
      .select("id, date, start_min, staff_id, service_id, service_name, patient_name")
      .eq("line_user_id", userId)
      .eq("status", "booked")
      .gte("date", today)
      .order("date")
      .order("start_min"),
    admin.from("settings").select("cancel_deadline_hours, change_deadline_hours").eq("id", 1).maybeSingle(),
    admin.from("staff").select("id, name, display_name, color"),
    admin.from("services").select("id, category, capacity"),
  ]);

  const cancelH = (cfg as { cancel_deadline_hours?: number } | null)?.cancel_deadline_hours ?? 0;
  const changeH = (cfg as { change_deadline_hours?: number } | null)?.change_deadline_hours ?? 0;
  const staffMap = new Map((staffRows || []).map((s) => [s.id as string, s]));
  const svcMap = new Map((svcRows || []).map((s) => [s.id as string, s]));
  const now = Date.now();

  const items = (appts || []).map((a) => {
    const hh = String(Math.floor(a.start_min / 60)).padStart(2, "0");
    const mm = String(a.start_min % 60).padStart(2, "0");
    const apptMs = Date.parse(`${a.date}T${hh}:${mm}:00+09:00`);
    const hoursUntil = (apptMs - now) / 3_600_000;
    const st = a.staff_id ? staffMap.get(a.staff_id) : null;
    const sv = a.service_id ? svcMap.get(a.service_id) : null;
    const cat = (sv?.category as string) || "";
    // 種別：定員制クラス（capacity>1）は体幹教室として扱う
    const kind: "class" | "kawanishi" | "care" =
      cat === "川西整体院" ? "kawanishi" : (sv && (sv.capacity as number) > 1) || cat === "体幹教室" ? "class" : "care";
    return {
      id: a.id,
      date: a.date,
      start_min: a.start_min,
      staff_id: a.staff_id,
      service_id: a.service_id,
      staff_name: st ? (st.display_name || st.name) : null,
      staff_color: st?.color ?? null,
      service_name: a.service_name,
      clinic: cat === "川西整体院" ? "川西整体院" : "茨木本院",
      kind,
      canCancel: hoursUntil >= cancelH,
      canChange: hoursUntil >= changeH,
    };
  });

  return NextResponse.json({ ok: true, items, cancelDeadlineHours: cancelH, changeDeadlineHours: changeH });
}
