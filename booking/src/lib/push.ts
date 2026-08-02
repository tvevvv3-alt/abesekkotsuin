// 運営（スタッフ）端末へのWebプッシュ通知。LINEの通数を消費しない。
// VAPID鍵は環境変数（VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT）で設定。
import webpush from "web-push";

type Sb = { from: (t: string) => any }; // createAdminClient の最小限の型

// 公開鍵は秘密ではないので既定値を同梱（クライアント側の既定値と一致させること）。
const FALLBACK_VAPID_PUBLIC =
  "BIgxLWtKe8jmM4ChMdSylMqzdDA0xqjoUbWo24lHi7fq-ggAJY-DtrunjTsIgaW43t3GroBtu5MQWOJiNDuYQzc";

function publicKey(): string {
  const env = (process.env.VAPID_PUBLIC_KEY || "").replace(/[^A-Za-z0-9\-_]/g, "");
  return env.length >= 80 ? env : FALLBACK_VAPID_PUBLIC;
}

let configured = false;
function ensure(): boolean {
  const priv = (process.env.VAPID_PRIVATE_KEY || "").trim();
  if (!priv) return false;
  if (!configured) {
    webpush.setVapidDetails(
      (process.env.VAPID_SUBJECT || "mailto:noreply@abe-sekkotsuin.jp").trim(),
      publicKey(),
      priv
    );
    configured = true;
  }
  return true;
}

// 秘密鍵さえ設定されていれば送信可能（公開鍵は既定値でカバー）。
export function pushConfigured(): boolean {
  return !!process.env.VAPID_PRIVATE_KEY;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

// 購読中の全端末へ送信。失効した購読(404/410)は自動削除。
export async function notifyStaff(admin: Sb, payload: PushPayload): Promise<void> {
  if (!ensure()) return;
  try {
    const { data } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth");
    const subs: Array<{ id: string; endpoint: string; p256dh: string; auth: string }> = data ?? [];
    const json = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            json
          );
        } catch (e) {
          const code = (e as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) {
            await admin.from("push_subscriptions").delete().eq("id", s.id);
          }
        }
      })
    );
  } catch {
    /* 通知失敗は本処理をブロックしない */
  }
}
