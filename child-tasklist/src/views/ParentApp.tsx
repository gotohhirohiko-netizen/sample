import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import NotificationSetup from "../components/NotificationSetup";
import ParentTodayView from "./ParentTodayView";
import ParentSetupView from "./ParentSetupView";
import type { Member } from "../types/models";

export default function ParentApp({ member }: { member: Member }) {
  const [tab, setTab] = useState<"today" | "setup">("today");
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("families")
      .select("invite_code")
      .eq("id", member.family_id)
      .single()
      .then(({ data }) => setInviteCode(data?.invite_code ?? null));
  }, [member.family_id]);

  return (
    <div className="screen">
      <NotificationSetup member={member} />

      {inviteCode && (
        <details className="card">
          <summary>お子さんの端末を参加させる招待コード</summary>
          <div className="invite-code">{inviteCode}</div>
          <p className="notice" style={{ marginBottom: 0 }}>
            お子さんのスマホでこのアプリを開き、「招待コードで子として参加する」からこのコードを入力してもらってください。
          </p>
        </details>
      )}

      <div style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        <button
          className={tab === "today" ? "primary" : ""}
          onClick={() => setTab("today")}
        >
          今日の進捗
        </button>
        <button
          className={tab === "setup" ? "primary" : ""}
          onClick={() => setTab("setup")}
        >
          項目設定
        </button>
      </div>

      {tab === "today" ? (
        <ParentTodayView familyId={member.family_id} />
      ) : (
        <ParentSetupView familyId={member.family_id} />
      )}
    </div>
  );
}
