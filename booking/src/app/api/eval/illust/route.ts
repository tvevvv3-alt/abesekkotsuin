import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 体幹評価レポートの項目イラストをアップロード（公開バケット eval に保存し、
// settings.eval_images にURLを保存）。key は operation/balance/handstand/ring/boxjump。
const KEYS = new Set(["operation", "balance", "handstand", "ring", "boxjump"]);

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "auth" }, { status: 401 });

  let key = "";
  let pngBase64 = "";
  try {
    const b = (await req.json()) as { key?: string; pngBase64?: string };
    key = b.key || "";
    pngBase64 = b.pngBase64 || "";
  } catch {
    /* noop */
  }
  if (!KEYS.has(key) || !pngBase64) return NextResponse.json({ ok: false, reason: "bad" }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, reason: "server" }, { status: 500 });

  await admin.storage.createBucket("eval", { public: true }).catch(() => {});
  const data = pngBase64.replace(/^data:image\/\w+;base64,/, "");
  const bytes = Buffer.from(data, "base64");
  const path = `illust/${key}.png`;
  const up = await admin.storage.from("eval").upload(path, bytes, { contentType: "image/png", upsert: true });
  if (up.error) return NextResponse.json({ ok: false, reason: "upload", error: up.error.message }, { status: 500 });

  const { data: pub } = admin.storage.from("eval").getPublicUrl(path);
  const url = `${pub.publicUrl}?v=${Date.now()}`; // キャッシュ回避

  // settings.eval_images をマージ更新
  const { data: s } = await admin.from("settings").select("eval_images").eq("id", 1).maybeSingle();
  const cur = (s?.eval_images as Record<string, string> | null) ?? {};
  const next = { ...cur, [key]: url };
  await admin.from("settings").update({ eval_images: next }).eq("id", 1);

  return NextResponse.json({ ok: true, url, images: next });
}
