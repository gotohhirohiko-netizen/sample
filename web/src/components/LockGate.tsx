import { useEffect, useState, type ReactNode } from "react";
import { isLockEnabled, unlockWithBiometrics } from "../lib/webauthnLock";

/** Face ID/Touch IDによるロック画面。ロック未設定の場合は素通しする */
export default function LockGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "locked" | "unlocked">("checking");

  async function attemptUnlock() {
    setState("checking");
    const enabled = await isLockEnabled();
    if (!enabled) {
      setState("unlocked");
      return;
    }
    const ok = await unlockWithBiometrics();
    setState(ok ? "unlocked" : "locked");
  }

  useEffect(() => {
    attemptUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "unlocked") {
    return <>{children}</>;
  }

  return (
    <div className="lock-screen">
      <div className="lock-icon">🔒</div>
      <h1 className="screen-title">ロック中</h1>
      {state === "checking" ? (
        <p className="muted">認証中...</p>
      ) : (
        <>
          <p className="muted">Face ID / Touch IDで認証してください</p>
          <button type="button" className="btn-primary" onClick={attemptUnlock}>
            再試行
          </button>
        </>
      )}
    </div>
  );
}
