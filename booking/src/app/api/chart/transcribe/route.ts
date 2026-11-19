import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 手書きメモ画像をClaude Visionで読み取り、プレーンテキストに文字起こしする。
const PROMPT = `これは日本の接骨院のカルテに手書きされたメモの画像です。
書かれている文字・数字・記号をできる限り正確にそのまま文字起こししてください。
- 日本語（ひらがな・カタカナ・漢字）と英数字をそのまま書き起こす
- 改行や箇条書き・矢印（→）など、元の構造はできるだけ保つ
- 判読が難しい箇所は推測せず ？ と書く
- 医療・施術の専門用語（部位名・症状・手技名など）に留意する
出力は文字起こし結果のテキストのみ（説明・前置き・コードフェンスは一切付けない）。`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, reason: "nokey" }, { status: 500 });
  }

  let dataUrl = "";
  try {
    const body = (await req.json()) as { image?: string };
    dataUrl = body.image || "";
  } catch {
    /* noop */
  }
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl.trim());
  if (!m) {
    return NextResponse.json({ ok: false, reason: "noimage" }, { status: 400 });
  }
  const mediaType = m[1];
  const base64 = m[2];

  const model = process.env.SALES_OCR_MODEL || "claude-sonnet-5";

  let text = "";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: false, reason: "api", status: res.status, detail: errText.slice(0, 500) },
        { status: 502 }
      );
    }
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    text = (json.content || []).filter((c) => c.type === "text").map((c) => c.text || "").join("");
  } catch (e) {
    return NextResponse.json({ ok: false, reason: "fetch", detail: String(e).slice(0, 300) }, { status: 502 });
  }

  const out = text.trim().replace(/^```[a-z]*\n?/i, "").replace(/```$/i, "").trim();
  if (!out) {
    return NextResponse.json({ ok: false, reason: "empty" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, text: out });
}
