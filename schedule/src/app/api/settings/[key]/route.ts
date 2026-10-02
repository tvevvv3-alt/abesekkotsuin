import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";
import { DEFAULT_PREFERENCES } from "@/lib/preferences";

export const dynamic = "force-dynamic";

// preferences = 阿部家の好み・ルール（メモ。AI を使うときはそのまま渡す）
// avoid = 献立に出さない食材・料理（カンマ区切り）
const DEFAULTS: Record<string, string> = { preferences: DEFAULT_PREFERENCES, avoid: "" };

type Ctx = { params: { key: string } };

export async function GET(_req: Request, { params }: Ctx) {
  if (!(params.key in DEFAULTS)) return NextResponse.json({ error: "unknown key" }, { status: 404 });
  try {
    const value = (await getSetting(params.key)) ?? DEFAULTS[params.key];
    return NextResponse.json({ value });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  if (!(params.key in DEFAULTS)) return NextResponse.json({ error: "unknown key" }, { status: 404 });
  try {
    const { value } = await req.json();
    await setSetting(params.key, String(value ?? ""));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
