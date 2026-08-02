import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyStaff, pushConfigured } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 通知の動作確認用（購読中の全端末へテスト通知）
export async function POST() {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, reason: "server" }, { status: 500 });
  if (!pushConfigured()) return NextResponse.json({ ok: false, reason: "notconfigured" });
  await notifyStaff(admin, {
    title: "テスト通知",
    body: "通知は正常に届いています ✅",
    url: "/admin",
    tag: "test",
  });
  return NextResponse.json({ ok: true });
}
