import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const t = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

// 診断用（HTMLで文字化けしない）。指定日の予約＋「壽朗/直美」を含む全予約を患者IDごとに表示。
// GET /api/admin/debug-appts?date=2026-11-21
export async function GET(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new NextResponse("<h3>ログインが必要です（/admin を開いてから）</h3>", { status: 401, headers: { "content-type": "text/html; charset=utf-8" } });

  const date = req.nextUrl.searchParams.get("date") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return new NextResponse("?date=YYYY-MM-DD", { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, reason: "server" }, { status: 500 });

  const { data: day } = await admin
    .from("appointments").select("id, start_min, patient_id, patient_name")
    .eq("date", date).neq("status", "cancelled").order("start_min");

  // その日に出てくる名前（壽朗/直美など）を含む全日の予約を集める
  const names = Array.from(new Set((day || []).map((a) => (a.patient_name || "").trim()).filter(Boolean)));
  const pids = Array.from(new Set((day || []).map((a) => a.patient_id).filter(Boolean)));
  const related: Record<string, unknown>[] = [];
  if (names.length) {
    const { data } = await admin.from("appointments").select("date, start_min, patient_id, patient_name").in("patient_name", names).neq("status", "cancelled").order("date");
    related.push(...((data as Record<string, unknown>[]) || []));
  }
  if (pids.length) {
    const { data } = await admin.from("appointments").select("date, start_min, patient_id, patient_name").in("patient_id", pids).neq("status", "cancelled").order("date");
    (data as Record<string, unknown>[] | null)?.forEach((r) => {
      if (!related.some((x) => x.date === r.date && x.start_min === r.start_min && x.patient_id === r.patient_id)) related.push(r);
    });
  }

  const sid = (id: unknown) => esc(String(id ?? "").slice(0, 8));
  const dayRows = (day || []).map((a) => `<tr><td>${t(a.start_min)}</td><td><b>${esc(a.patient_name)}</b></td><td>${sid(a.patient_id)}</td></tr>`).join("");
  const relRows = related
    .sort((a, b) => String(a.patient_name).localeCompare(String(b.patient_name)) || String(a.date).localeCompare(String(b.date)))
    .map((r) => `<tr><td>${esc(r.date)}</td><td>${t(Number(r.start_min))}</td><td><b>${esc(r.patient_name)}</b></td><td>${sid(r.patient_id)}</td></tr>`).join("");

  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>診断 ${date}</title>
  <style>body{font-family:system-ui;padding:12px;font-size:14px}table{border-collapse:collapse;width:100%;margin-bottom:20px}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}th{background:#eef}h3{margin:8px 0}</style></head><body>
  <h3>${date} の予約（予約名＝カルテ・個別売上が読む名前）</h3>
  <table><tr><th>時刻</th><th>予約名</th><th>患者ID先頭</th></tr>${dayRows}</table>
  <h3>同じ名前／同じ患者IDの予約（全日）＝壽朗が何件・どの患者IDにあるか</h3>
  <table><tr><th>日付</th><th>時刻</th><th>予約名</th><th>患者ID先頭</th></tr>${relRows}</table>
  </body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
