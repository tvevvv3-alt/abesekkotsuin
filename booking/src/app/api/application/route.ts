import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { appSections } from "@/lib/application";
import { notifyStaff } from "@/lib/push";
import type { QValue } from "@/lib/questionnaire";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const normName = (s: string | null | undefined) => (s || "").replace(/[\s　]/g, "").trim();
const getStr = (v: QValue, k: string) => (typeof v[k] === "string" ? (v[k] as string).trim() : "");

async function loadSchema(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  try {
    const { data } = await admin.from("settings").select("application_schema").eq("id", 1).maybeSingle();
    return appSections((data as { application_schema?: unknown } | null)?.application_schema);
  } catch {
    return appSections(null);
  }
}

// GET /api/application?a=<予約ID> … 申込書の初期表示（質問定義＋患者基本情報＋既存回答）
export async function GET(req: NextRequest) {
  const a = req.nextUrl.searchParams.get("a") || "";
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, reason: "server" }, { status: 500 });

  const schema = await loadSchema(admin);
  if (!a) return NextResponse.json({ ok: true, schema, patient: { name: "", kana: "", birth: "", phone: "" }, answers: {} });

  const { data: appt } = await admin.from("appointments").select("id, patient_id, patient_name").eq("id", a).maybeSingle();
  if (!appt) return NextResponse.json({ ok: false, reason: "notfound" }, { status: 404 });

  let patient = { name: appt.patient_name ?? "", kana: "", birth: "", phone: "" };
  let answers: QValue = {};
  if (appt.patient_id) {
    const { data: p } = await admin.from("patients").select("name, name_kana, birth_date, phone").eq("id", appt.patient_id).maybeSingle();
    if (p) patient = { name: p.name ?? "", kana: p.name_kana ?? "", birth: p.birth_date ?? "", phone: p.phone ?? "" };
    const { data: it } = await admin.from("patient_application").select("answers").eq("patient_id", appt.patient_id).maybeSingle();
    const q = (it as { answers?: unknown } | null)?.answers;
    if (q && typeof q === "object") answers = q as QValue;
  }
  return NextResponse.json({ ok: true, schema, patient, answers });
}

// 白紙モード：氏名/生年月日/電話で患者を特定（無ければ新規作成）
async function resolvePatientForBlank(admin: NonNullable<ReturnType<typeof createAdminClient>>, answers: QValue): Promise<{ id: string } | { error: string }> {
  const name = getStr(answers, "name");
  const kana = getStr(answers, "kana");
  const birth = getStr(answers, "birth");
  const phone = getStr(answers, "phone");
  if (!normName(name)) return { error: "noname" };
  if (birth) {
    const { data } = await admin.from("patients").select("id, name").eq("birth_date", birth);
    const hit = (data ?? []).find((p) => normName(p.name) === normName(name));
    if (hit) return { id: hit.id as string };
  }
  if (phone) {
    const { data } = await admin.from("patients").select("id, name").eq("phone", phone);
    const hit = (data ?? []).find((p) => normName(p.name) === normName(name));
    if (hit) return { id: hit.id as string };
  }
  const { count } = await admin.from("patients").select("id", { count: "exact", head: true });
  const num = "B" + String((count ?? 0) + 1).padStart(5, "0");
  const { data, error } = await admin
    .from("patients")
    .insert({ patient_number: num, name: normName(name), name_kana: normName(kana) || null, birth_date: birth || null, phone: phone || null })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message || "patient" };
  return { id: data.id as string };
}

async function notifyApplication(admin: NonNullable<ReturnType<typeof createAdminClient>>, patientId: string, answers: QValue) {
  let name = getStr(answers, "name");
  if (!name) {
    const { data } = await admin.from("patients").select("name").eq("id", patientId).maybeSingle();
    name = (data as { name?: string } | null)?.name || "参加者";
  }
  await notifyStaff(admin, {
    title: "📋 体幹教室の申込書が届きました",
    body: `${name}さんが申込書を送信しました`,
    url: "/admin/application",
    tag: "application-" + patientId,
  });
}

// POST /api/application … 申込書の回答を保存
export async function POST(req: NextRequest) {
  let appointmentId = "";
  let answers: QValue = {};
  let blank = false;
  try {
    const b = (await req.json()) as { appointmentId?: string; answers?: QValue; blank?: boolean };
    appointmentId = b.appointmentId || "";
    answers = b.answers || {};
    blank = !!b.blank;
  } catch {
    return NextResponse.json({ ok: false, reason: "bad" }, { status: 400 });
  }
  if (!appointmentId && !blank) return NextResponse.json({ ok: false, reason: "bad" }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, reason: "server" }, { status: 500 });

  let patientId: string;
  if (appointmentId) {
    const { data: appt } = await admin.from("appointments").select("id, patient_id").eq("id", appointmentId).maybeSingle();
    if (!appt) return NextResponse.json({ ok: false, reason: "notfound" }, { status: 404 });
    if (!appt.patient_id) return NextResponse.json({ ok: false, reason: "nopatient" });
    patientId = appt.patient_id;
  } else {
    const r = await resolvePatientForBlank(admin, answers);
    if ("error" in r) return NextResponse.json({ ok: false, reason: r.error === "noname" ? "noname" : "patient", error: r.error });
    patientId = r.id;
  }

  const { error } = await admin.from("patient_application").upsert({
    patient_id: patientId,
    answers,
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "patient_id" });
  if (error) return NextResponse.json({ ok: false, reason: "save", error: error.message });
  await notifyApplication(admin, patientId, answers);
  return NextResponse.json({ ok: true });
}
