import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 手書きメモ画像をClaude Visionで読み取り、医学用語を推測補完してテキスト化する。
const PROMPT = `これは日本の接骨院（柔道整復・パーソナルトレーニング）のカルテに手書きされたメモの画像です。
走り書きや略記が多いので、文脈から医学・運動器の専門用語を積極的に推測し、正式名称に補完して書き起こしてください。

方針:
- 日本語（ひらがな・カタカナ・漢字）と英数字を書き起こす。改行・箇条書き・矢印（→）など元の構造は保つ。

英数字の読み取り（特に重要・最優先）:
- アルファベットと数字は1文字ずつ字形をよく観察し、正確に読む。走り書きでも形から判断する。
- 紛らわしい字を取り違えない。代表例:
  ・0(ゼロ) と O/o(オー)、1 と I/l、2 と Z、5 と S、6 と b/G、7 と T、8 と B、9 と g/q、rn と m
- 大文字・小文字は書かれたとおりに厳密に区別して再現する（勝手に大文字化・小文字化・単語の先頭だけ大文字化などをしない）。
- ★大文字を小文字に変換して出力しないこと。字形が大きい・角張っている・ベースラインより高いなど大文字の特徴があれば必ず大文字(A,B,C,…)で出力する。カルテでは略語を大文字で書くことが多い（ROM, ACL, PCL, MCL, LCL, OA, RA, SLR, ADL, MMT, RICE, ROM, R/L, Th, L1, S1 など）ので、迷ったら安易に小文字化しない。
- 1文字だけの大文字（R=右, L=左, M=筋 など）も大文字のまま残す。
- 単位・記号はそのまま正確に：kg, g, cm, mm, %, °, R/L, ×, ÷, +, -, →, ① など。
- 回数・セット・重量・数式はそのまま（例: 3×10, 10rep, 5set, 20kg, 1RM）。
- 英単語・略語（ROM, ACL, PNF, squat, deadlift など）は綴りと大文字小文字を正確に。

- 略記・省略は正式な医学用語へ推測補完する。例:
  ・「大腿四頭M」「大腿四頭筋M」→「大腿四頭筋」（M/ｍ＝筋）
  ・「ハムスト」→「ハムストリングス」、「腸腰M」→「腸腰筋」、「ROM」→可動域 など文脈で判断
  ・筋(M)・靱帯・腱・関節・骨・神経の部位名、整形外科テスト名、手技・運動種目名を優先して補完
- 専門用語（特に筋・骨・関節・神経・手技・運動器の名称）は、初出時に全角カッコで英語（無ければローマ字）を併記する。例:
  「大腿四頭筋（quadriceps）」「前十字靱帯（ACL）」「スクワット（squat）」「僧帽筋（trapezius）」
- 数値・単位・%・左右（R/L・右/左）・度数はそのまま残す。
- どうしても判読できない箇所のみ ？ と書く（推測できるものは積極的に補完してよい）。

出力は補完後の本文テキストのみ（説明・前置き・コードフェンスは一切付けない）。`;

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
        temperature: 0,
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
