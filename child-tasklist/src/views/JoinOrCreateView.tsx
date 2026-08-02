import { useState } from "react";
import { createFamily, joinFamily } from "../lib/family";
import type { Member } from "../types/models";

export default function JoinOrCreateView({
  authUserId,
  onJoined,
}: {
  authUserId: string;
  onJoined: (member: Member) => void;
}) {
  const [mode, setMode] = useState<"select" | "create" | "join">("select");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const member = await createFamily(authUserId, displayName || "親");
      onJoined(member);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    setBusy(true);
    setError(null);
    try {
      const member = await joinFamily(authUserId, inviteCode, displayName || "子ども");
      onJoined(member);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (mode === "select") {
    return (
      <div className="screen">
        <h1>遠征タスクリスト</h1>
        <p>この端末を親・子のどちらとして使いますか?</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button className="primary" onClick={() => setMode("create")}>
            親として家族を作る
          </button>
          <button onClick={() => setMode("join")}>招待コードで子として参加する</button>
        </div>
      </div>
    );
  }

  if (mode === "create") {
    return (
      <div className="screen">
        <h1>家族を作る</h1>
        <p>あなた(保護者)の呼び方を入力してください。</p>
        <input
          type="text"
          placeholder="例: お母さん"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <button onClick={() => setMode("select")} disabled={busy}>
            戻る
          </button>
          <button className="primary" onClick={handleCreate} disabled={busy}>
            作成する
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="screen">
      <h1>招待コードで参加</h1>
      <p>保護者から共有された招待コードと、お子さんの呼び方を入力してください。</p>
      <input
        type="text"
        placeholder="招待コード(例: AB3D9F2K)"
        value={inviteCode}
        onChange={(e) => setInviteCode(e.target.value)}
        style={{ marginBottom: 10, textTransform: "uppercase" }}
      />
      <input
        type="text"
        placeholder="例: たろう"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />
      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button onClick={() => setMode("select")} disabled={busy}>
          戻る
        </button>
        <button className="primary" onClick={handleJoin} disabled={busy || !inviteCode}>
          参加する
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
