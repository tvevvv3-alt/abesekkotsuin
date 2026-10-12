import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toIntakeLinked, type QValue } from "@/lib/questionnaire";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/intake?a=<予約ID> … 問診票の初期表示（患者基本情報＋既存回答）を返す
export async function GET(req: NextRequest) {
  const a = req.nextUrl.searchParams.get("a") || "";
  if (!a) return NextResponse.json({ ok: false, reason: "bad" }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, reason: "server" }, { status: 500 });

  const { data: appt } = await admin
    .from("appointments")
    .select("id, patient_id, patient_name, date")
    .eq("id", a)
    .maybeSingle();
  if (!appt) return NextResponse.json({ ok: false, reason: "notfound" }, { status: 404 });

  let patient: { name: string; kana: string; birth: string; phone: string } = { name: appt.patient_name ?? "", kana: "", birth: "", phone: "" };
  let answers: QValue = {};
  if (appt.patient_id) {
    const { data: p } = await admin.from("patients").select("name, name_kana, birth_date, phone").eq("id", appt.patient_id).maybeSingle();
    if (p) patient = { name: p.name ?? "", kana: p.name_kana ?? "", birth: p.birth_date ?? "", phone: p.phone ?? "" };
    const { data: it } = await admin.from("patient_intake").select("questionnaire").eq("patient_id", appt.patient_id).maybeSingle();
    const q = (it as { questionnaire?: unknown } | null)?.questionnaire;
    if (q && typeof q === "object") answers = q as QValue;
  }
  return NextResponse.json({ ok: true, patient, answers, date: appt.date });
}

// POST /api/intake … 問診票の回答を保存（患者が送信）
export async function POST(req: NextRequest) {
  let appointmentId = "";
  let answers: QValue = {};
  try {
    const b = (await req.json()) as { appointmentId?: string; answers?: QValue };
    appointmentId = b.appointmentId || "";
    answers = b.answers || {};
  } catch {
    return NextResponse.json({ ok: false, reason: "bad" }, { status: 400 });
  }
  if (!appointmentId) return NextResponse.json({ ok: false, reason: "bad" }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, reason: "server" }, { status: 500 });

  const { data: appt } = await admin.from("appointments").select("id, patient_id").eq("id", appointmentId).maybeSingle();
  if (!appt) return NextResponse.json({ ok: false, reason: "notfound" }, { status: 404 });
  if (!appt.patient_id) return NextResponse.json({ ok: false, reason: "nopatient" });

  const linked = toIntakeLinked(answers);
  const row = {
    patient_id: appt.patient_id,
    questionnaire: answers,
    submitted_at: new Date().toISOString(),
    sport: linked.sport || null,
    weekly_freq: linked.weekly_freq || null,
    symptom_area: linked.symptom_area || null,
    onset: linked.onset || null,
    history: linked.history || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("patient_intake").upsert(row, { onConflict: "patient_id" });
  if (error) {
    // questionnaire/submitted_at 未マイグレーション時は連携項目だけでも保存
    const { error: e2 } = await admin.from("patient_intake").upsert({
      patient_id: appt.patient_id, sport: linked.sport || null, weekly_freq: linked.weekly_freq || null,
      symptom_area: linked.symptom_area || null, onset: linked.onset || null, history: linked.history || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "patient_id" });
    if (e2) return NextResponse.json({ ok: false, reason: "save", error: e2.message });
    return NextResponse.json({ ok: true, partial: true });
  }
  return NextResponse.json({ ok: true });
}
