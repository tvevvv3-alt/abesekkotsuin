import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// レセコン「日計表」の写真をClaude Visionで読み取り、患者ごとの
// 合計額・負担額・保険外(自費) を構造化して返す。担当は予約側で紐付ける。
const PROMPT = `これは日本の接骨院のレセコン「日計表」の写真です。表の各患者行を正確に読み取ってください。
列は左から: No / カルテNo / 受診者氏名 / 保険 / 助成 / 他 / 日数 / 傷数 / 合計額 / 負担額 / 保険外 / メモ(来院時刻)。
各行について次を数値で返す（「円」やカンマは除く。整数）:
- name: 受診者氏名（姓名、スペースはそのまま）
- insurance: 合計額
- burden: 負担額
- selfpay: 保険外
- note: この行に関係する手書きメモがあればその内容（なければ null）
読み取れない数値は null。同じ氏名が複数行あってもそのまま複数行として返す。
一番下の「◯月◯日分 合計 N件」の行は rows に含めず totals にまとめる。
写真内の手書きメモ（付箋・ペン書き）もすべて読み取り、notes 配列に原文のまま入れる。
（例:「山本将大 2つとってる（保険と自費）」「物販 ○○」など。仕分けの手掛かりになるもの）。
特定の患者に関するメモなら、その患者行の note にも入れる。
出力はJSONのみ（前後に文章やコードフェンスを付けない）。形式:
{"rows":[{"no":1,"name":"吉田 来実","insurance":2495,"burden":500,"selfpay":4400,"note":null}],"totals":{"count":13,"insurance":20456,"burden":4050,"selfpay":50600},"notes":["9/15 山本将大 2つとってる（保険と自費）"]}`;

type OcrRow = { no?: number | null; name: string; insurance: number | null; burden: number | null; selfpay: number | null; note?: string | null };
type OcrResult = { rows: OcrRow[]; totals: { count: number | null; insurance: number | null; burden: number | null; selfpay: number | null }; notes?: string[] };

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
  // data:image/jpeg;base64,xxxx を分解
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
        max_tokens: 4000,
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

  // JSON抽出（コードフェンスや前後テキストが混ざっても拾う）
  const parsed = extractJson(text);
  if (!parsed) {
    return NextResponse.json({ ok: false, reason: "parse", raw: text.slice(0, 800) }, { status: 502 });
  }
  return NextResponse.json({ ok: true, result: parsed });
}

function extractJson(text: string): OcrResult | null {
  let t = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(t.slice(start, end + 1)) as OcrResult;
    if (!obj || !Array.isArray(obj.rows)) return null;
    return obj;
  } catch {
    return null;
  }
}
