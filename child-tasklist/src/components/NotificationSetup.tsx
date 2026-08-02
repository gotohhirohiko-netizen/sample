import { useState } from "react";
import { isPushSupported, subscribeToPush } from "../lib/push";
import { errorMessage as toErrorMessage } from "../lib/errorMessage";
import type { Member } from "../types/models";

const isStandalone =
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true);

export default function NotificationSetup({ member }: { member: Member }) {
  const [status, setStatus] = useState<"idle" | "done" | "error">(
    member.push_subscription ? "done" : "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (status === "done") return null;

  if (!isStandalone) {
    return (
      <div className="notice">
        通知を受け取るには、まずこの画面共有メニューから「ホーム画面に追加」してから、ホーム画面のアイコンで開き直してください。
      </div>
    );
  }

  if (!isPushSupported()) {
    return <div className="notice">この端末・ブラウザは通知に対応していません。</div>;
  }

  return (
    <div className="notice">
      <p style={{ marginTop: 0 }}>通知を受け取るには許可が必要です。</p>
      <button
        className="primary"
        onClick={async () => {
          try {
            await subscribeToPush(member.id);
            setStatus("done");
          } catch (e) {
            setErrorMessage(toErrorMessage(e));
            setStatus("error");
          }
        }}
      >
        通知を有効にする
      </button>
      {errorMessage && <p className="error">{errorMessage}</p>}
    </div>
  );
}
