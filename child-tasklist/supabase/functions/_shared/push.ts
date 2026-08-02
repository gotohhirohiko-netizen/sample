import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:example@example.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

export interface PushPayload {
  title: string;
  body: string;
}

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * 購読先へPush送信する。410/404(購読失効)の場合のみ呼び出し元にわかるようfalseを返す。
 * それ以外のエラーは呼び出し元のループを止めないよう、ログのみ出して例外を投げない。
 */
export async function sendPush(
  subscription: PushSubscriptionJSON,
  payload: PushPayload,
): Promise<{ ok: boolean; expired: boolean }> {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { ok: true, expired: false };
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    const expired = statusCode === 404 || statusCode === 410;
    console.error("push send failed", statusCode, err);
    return { ok: false, expired };
  }
}
