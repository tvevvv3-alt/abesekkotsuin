import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lineMessagingConfigured, pushImage } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 体幹評価レポート画像をLINEで送る。
// ブラウザで作ったPNG(base64)を受け取り、Supabase Storage(公開)へ保存し、
// その氏名に紐づくLINEユーザー（体幹教室の予約から取得）へ画像メッセージを送信する。
export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "auth" }, { status: 401 });

  let evalId = "";
  let name = "";
  let pngBase64 = "";
  let lineUserId = "";
  try {
    const b = (await req.json()) as { evalId?: string; name?: string; pngBase64?: string; lineUserId?: string };
    evalId = b.evalId || "";
    name = (b.name || "").trim();
    pngBase64 = b.pngBase64 || "";
    lineUserId = (b.lineUserId || "").trim();
  } catch {
    /* noop */
  }
  if (!name || !pngBase64) return NextResponse.json({ ok: false, reason: "bad" }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, reason: "server" }, { status: 500 });

  // 送信先LINEユーザー。明示指定（予約から起動）を最優先。無ければ氏名で直近予約から取得。
  let userId: string | null = lineUserId || null;
  if (!userId) {
    const { data: appts } = await admin
      .from("appointments")
      .select("line_user_id, date")
      .eq("patient_name", name)
      .not("line_user_id", "is", null)
      .order("date", { ascending: false })
      .limit(1);
    userId = (appts as { line_user_id: string | null }[] | null)?.[0]?.line_user_id ?? null;
  }
  if (!userId) return NextResponse.json({ ok: false, reason: "noline" });

  if (!lineMessagingConfigured()) return NextResponse.json({ ok: false, reason: "notconfigured" });

  // 公開バケット eval を用意（無ければ作成）
  await admin.storage.createBucket("eval", { public: true }).catch(() => {});

  // base64 → バイナリ
  const data = pngBase64.replace(/^data:image\/png;base64,/, "");
  const bytes = Buffer.from(data, "base64");
  const path = `${evalId || "eval"}-${Date.now()}.png`;
  const up = await admin.storage.from("eval").upload(path, bytes, {
    contentType: "image/png",
    upsert: true,
  });
  if (up.error) return NextResponse.json({ ok: false, reason: "upload", error: up.error.message }, { status: 500 });

  const { data: pub } = admin.storage.from("eval").getPublicUrl(path);
  const url = pub.publicUrl;
  if (!url) return NextResponse.json({ ok: false, reason: "url" }, { status: 500 });

  const r = await pushImage(userId, url);
  if (!r.ok) return NextResponse.json({ ok: false, reason: "line", error: r.error });

  if (evalId) {
    await admin.from("core_evaluations").update({ line_sent_at: new Date().toISOString() }).eq("id", evalId);
  }
  return NextResponse.json({ ok: true, url });
}
