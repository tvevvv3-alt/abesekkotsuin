import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// レセコン「日計表」の写真をClaude Visionで読み取り、患者ごとの
// 合計額・負担額・保険外(自費) を構造化して返す。担当は予約側で紐付ける。
const PROMPT = `これは日本の接骨院のレセコンの写真です。次のいずれかの形式があります:
(A) 印刷された「日計表」  (B) 画面の「今日の来院患者」一覧。
どちらも患者ごとに 合計額・負担額・保険外 の金額列があります。列の並び順は形式で異なる
（例: 画面は 保険外→合計額→負担額→入金額 の順、印刷は 合計額→負担額→保険外 の順）ので、
必ず「列見出しの名前」で対応付けてください（位置で決め打ちしない）。
各患者行について次を整数で返す（「円」やカンマは除く）:
- name: 受診者氏名（姓名、スペースはそのまま）
- insurance: 合計額
- burden: 負担額
- selfpay: 保険外
- note: この行に関係する手書きメモがあればその内容（なければ null）
読み取れない数値は null。同じ氏名が複数行あってもそのまま複数行として返す。
氏名の無い行・合計行・小計行は rows に含めない。
性別/生年月日/保険/保険者No/名称/有効期限/助成/他/日数/傷数/入金額/済 などの他の列は無視。
合計（件数・合計額・負担額・保険外）は、画面上部のボックスまたは表の最下部の合計行から読み totals に入れる。
写真内の手書きメモ（付箋・ペン書き）もすべて読み取り、notes 配列に原文のまま入れる。
（例:「山本将大 2つとってる（保険と自費）」「物販 ○○」など。仕分けの手掛かりになるもの）。
特定の患者に関するメモなら、その患者行の note にも入れる。
出力はJSONのみ（前後に文章やコードフェンスを付けない）。形式:
{"rows":[{"no":1,"name":"吉田 来実","insurance":2495,"burden":500,"selfpay":4400,"note":null}],"totals":{"count":39,"insurance":10643,"burden":1650,"selfpay":254040},"notes":["山本将大 2つとってる（保険と自費）"]}`;

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
