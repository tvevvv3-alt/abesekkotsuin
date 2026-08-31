import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { replyMessages, pushMessages } from "@/lib/line";

export const runtime = "nodejs";

// 予約サイトのURL。環境変数がどんな形（スキーム無し / http:// など）でも
// 必ず https:// に正規化する。LINEは https 以外のURIを拒否するため。
function siteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || "abesekkotsuin.vercel.app").trim();
  const rest = raw
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "") // 先頭のスキーム(http:// 等)を除去
    .replace(/^\/+/, "") // 先頭スラッシュ除去
    .replace(/\/+$/, ""); // 末尾スラッシュ除去
  return "https://" + rest;
}

// バナー画像入りのリッチなカード（Flex）。画像タップ・ボタンどちらでも開く。
function bookingCard(text: string, label: string, uri: string) {
  // ?v= はLINE側の画像キャッシュを更新するため（バナー差し替え時に上げる）
  const img = siteUrl() + "/line-yoyaku.png?v=3";
  return {
    type: "flex",
    altText: text,
    contents: {
      type: "bubble",
      size: "kilo", // 標準(mega)より一回り小さくコンパクトに
      hero: {
        type: "image",
        url: img,
        size: "full",
        aspectRatio: "80:53", // 2400x1590 を約分（LINEは大きすぎる比を弾くことがある）
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
    return [bookingCard("予約　キャンセル　変更ができます", "予約を確認する", siteUrl() + "/my")];
  }
  if (/予約/.test(t)) {
    return [bookingCard("予約　キャンセル　変更ができます", "予約する", siteUrl())];
  }
  return null;
}

type LineEvent = {
  type: string;
  mode?: string; // "active" | "standby"
  replyToken?: string;
  message?: { type?: string; text?: string };
  source?: { userId?: string };
};

// チャットモード（standby）では reply が使えないため push で送る。それ以外は reply。
async function deliver(ev: LineEvent, messages: unknown[]): Promise<{ ok: boolean; error?: string }> {
  const userId = ev.source?.userId;
  if (ev.mode === "standby" || !ev.replyToken) {
    if (!userId) return { ok: false, error: "no userId for push" };
    return pushMessages(userId, messages);
  }
  const r = await replyMessages(ev.replyToken, messages);
  // まれに reply が失敗（token期限切れ等）した場合は push でフォロー。
  if (!r.ok && userId) return pushMessages(userId, messages);
  return r;
}

export async function POST(req: NextRequest) {
  const body = await req.text();

  // 署名検証（Messaging APIチャネルの Channel secret）。未設定でも動くが、設定推奨。
  const secret = (process.env.LINE_CHANNEL_SECRET || "").trim();
  if (secret) {
    const sig = req.headers.get("x-line-signature") || "";
    const expected = crypto.createHmac("sha256", secret).update(body).digest("base64");
    if (sig !== expected) {
      // 署名が合わない＝secretの値ズレ。原因を残しつつ、返信自体は続行して機能を止めない。
      console.error(
        `[line-webhook] signature mismatch: header=${sig.slice(0, 8)}… expected=${expected.slice(0, 8)}… (LINE_CHANNEL_SECRETを確認)`
      );
    }
  } else {
    console.log("[line-webhook] LINE_CHANNEL_SECRET 未設定（署名検証スキップ）");
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
        if (ev.type === "message" && ev.message?.type === "text") {
          const msgs = replyForText(ev.message.text || "");
          if (msgs) {
            const r = await deliver(ev, msgs);
            if (!r.ok) console.error(`[line-webhook] deliver failed: ${r.error}`);
          }
        } else if (ev.type === "follow") {
          // 友だち追加時：予約カードを返す
          const r = await deliver(ev, [
            bookingCard("友だち追加ありがとうございます🌿\n予約　キャンセル　変更ができます", "予約する", siteUrl()),
          ]);
          if (!r.ok) console.error(`[line-webhook] follow deliver failed: ${r.error}`);
        }
      } catch (e) {
        console.error(`[line-webhook] handler error: ${e instanceof Error ? e.message : String(e)}`);
      }
    })
  );

  return NextResponse.json({ ok: true });
}

// LINEの疎通確認（GET）用
export async function GET() {
  return NextResponse.json({ ok: true, service: "line-webhook" });
}
