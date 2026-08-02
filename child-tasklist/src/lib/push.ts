import { supabase } from "./supabaseClient";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window;
}

/**
 * 通知許可を要求し、Push購読を作成してmembersテーブルに保存する。
 * iOS Safariではホーム画面に追加したPWAでのみ動作する。
 * ユーザー操作(ボタンタップ)から呼び出すこと。
 */
export async function subscribeToPush(memberId: string): Promise<void> {
  if (!isPushSupported()) {
    throw new Error("この端末・ブラウザはプッシュ通知に対応していません");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("通知が許可されませんでした");
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY) as BufferSource,
  });

  const { error } = await supabase
    .from("members")
    .update({ push_subscription: subscription.toJSON() })
    .eq("id", memberId);
  if (error) throw error;
}
