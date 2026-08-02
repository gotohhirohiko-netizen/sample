import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { errorMessage } from "../lib/errorMessage";
import NotificationSetup from "../components/NotificationSetup";
import ParentTodayView from "./ParentTodayView";
import ParentSetupView from "./ParentSetupView";
import type { Family, Member } from "../types/models";

const REMIND_INTERVAL_OPTIONS = [15, 30, 45, 60, 90, 120];

export default function ParentApp({ member }: { member: Member }) {
  const [tab, setTab] = useState<"today" | "setup">("today");
  const [family, setFamily] = useState<Family | null>(null);
  const [intervalSaving, setIntervalSaving] = useState(false);
  const [intervalError, setIntervalError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("families")
      .select("*")
      .eq("id", member.family_id)
      .single()
      .then(({ data }) => setFamily(data));
  }, [member.family_id]);

  async function updateReminderInterval(minutes: number) {
    if (!family) return;
    setIntervalSaving(true);
    setIntervalError(null);
    try {
      const { error } = await supabase
        .from("families")
        .update({ reminder_interval_minutes: minutes })
        .eq("id", family.id);
      if (error) throw error;
      setFamily({ ...family, reminder_interval_minutes: minutes });
    } catch (e) {
      setIntervalError(errorMessage(e));
    } finally {
      setIntervalSaving(false);
    }
  }

  return (
    <div className="screen">
      <NotificationSetup member={member} />

      {family && (
        <details className="card">
          <summary>お子さんの端末を参加させる招待コード</summary>
          <div className="invite-code">{family.invite_code}</div>
          <p className="notice" style={{ marginBottom: 0 }}>
            お子さんのスマホでこのアプリを開き、「招待コードで子として参加する」からこのコードを入力してもらってください。
          </p>
        </details>
      )}

      {family && (
        <details className="card">
          <summary>リマインドの繰り返し間隔</summary>
          <p className="notice">
            未チェックの項目を、目安時刻を過ぎてから何分おきに再通知するかを設定します。
          </p>
          <select
            value={family.reminder_interval_minutes}
            disabled={intervalSaving}
            onChange={(e) => updateReminderInterval(Number(e.target.value))}
          >
            {REMIND_INTERVAL_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes}分おき
              </option>
            ))}
          </select>
          {intervalError && <p className="error">{intervalError}</p>}
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
