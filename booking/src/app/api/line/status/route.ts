import { NextResponse } from "next/server";
import { lineLoginConfigured, lineMessagingConfigured } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 患者画面が「LINEで受け取る」ボタンを出すか判断するための状態。
export async function GET() {
  return NextResponse.json({
    enabled: lineLoginConfigured() && lineMessagingConfigured(),
  });
}
