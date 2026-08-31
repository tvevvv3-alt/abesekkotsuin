import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { replyMessages } from "@/lib/line";

export const runtime = "nodejs";

// 予約サイトのURL（末尾スラッシュなし）
function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://abesekkotsuin.vercel.app").replace(/\/$/, "");
}

// バナー画像入りのリッチなカード（Flex）。画像タップ・ボタンどちらでも開く。
function bookingCard(text: string, label: string, uri: string) {
  const img = siteUrl() + "/line-yoyaku.png";
  return {
    type: "flex",
    altText: text,
    contents: {
      type: "bubble",
      hero: {
        type: "image",
        url: img,
        size: "full",
        aspectRatio: "1200:795",
        aspectMode: "cover",
        action: { type: "uri", uri },
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text, wrap: true, size: "md", weight: "bold", color: "#16243F" },
          {
            type: "button",
            style: "primary",
            color: "#C9A24A",
            height: "sm",
            action: { type: "uri", label, uri },
          },
        ],
      },
    },
  };
}

// 受信テキスト → 返信メッセージ（該当キーワードだけ自動返信。それ以外は手動チャットに回す）
function replyForText(raw: string): unknown[] | null {
  const t = (raw || "").trim();
  if (/確認|変更|キャンセル/.test(t)) {
    return [bookingCard("ご予約の確認・変更・キャンセルはこちらから。", "予約を確認する", siteUrl() + "/my")];
  }
  if (/予約/.test(t)) {
    return [bookingCard("LINE上で予約を進めていきます。", "予約メニューを開く", siteUrl())];
  }
  return null;
}

type LineEvent = {
  type: string;
  replyToken?: string;
  message?: { type?: string; text?: string };
};

export async function POST(req: NextRequest) {
  const body = await req.text();

  // 署名検証（Messaging APIチャネルの Channel secret）。未設定でも動くが、設定推奨。
  const secret = (process.env.LINE_CHANNEL_SECRET || "").trim();
  if (secret) {
    const sig = req.headers.get("x-line-signature") || "";
    const expected = crypto.createHmac("sha256", secret).update(body).digest("base64");
    if (sig !== expected) {
      return NextResponse.json({ ok: false, reason: "bad signature" }, { status: 401 });
    }
  }

  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(body).events as LineEvent[]) ?? [];
  } catch {
    return NextResponse.json({ ok: true });
  }

  await Promise.all(
    events.map(async (ev) => {
      try {
        if (ev.type === "message" && ev.message?.type === "text" && ev.replyToken) {
          const msgs = replyForText(ev.message.text || "");
          if (msgs) await replyMessages(ev.replyToken, msgs);
        } else if (ev.type === "follow" && ev.replyToken) {
          // 友だち追加時：予約カードを返す
          await replyMessages(ev.replyToken, [
            bookingCard("友だち追加ありがとうございます。ご予約はこちらからどうぞ。", "予約メニューを開く", siteUrl()),
          ]);
        }
      } catch {
        /* 1件の失敗で全体を落とさない */
      }
    })
  );

  return NextResponse.json({ ok: true });
}

// LINEの疎通確認（GET）用
export async function GET() {
  return NextResponse.json({ ok: true, service: "line-webhook" });
}
