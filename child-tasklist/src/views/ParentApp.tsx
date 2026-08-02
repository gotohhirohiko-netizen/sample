import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { errorMessage } from "../lib/errorMessage";
import NotificationSetup from "../components/NotificationSetup";
import ParentTodayView from "./ParentTodayView";
import ParentSetupView from "./ParentSetupView";
import type { Family, Member } from "../types/models";

const REMIND_INTERVAL_MIN = 5;
const REMIND_INTERVAL_MAX = 180;
const REMIND_INTERVAL_STEP = 5;

export default function ParentApp({ member }: { member: Member }) {
  const [tab, setTab] = useState<"today" | "setup">("today");
  const [family, setFamily] = useState<Family | null>(null);
  const [intervalInput, setIntervalInput] = useState("30");
  const [intervalSaving, setIntervalSaving] = useState(false);
  const [intervalError, setIntervalError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("families")
      .select("*")
      .eq("id", member.family_id)
      .single()
      .then(({ data }) => {
        setFamily(data);
        if (data) setIntervalInput(String(data.reminder_interval_minutes));
      });
  }, [member.family_id]);

  async function saveReminderInterval() {
    if (!family) return;
    const minutes = Number(intervalInput);
    if (
      !Number.isInteger(minutes) ||
      minutes < REMIND_INTERVAL_MIN ||
      minutes > REMIND_INTERVAL_MAX
    ) {
      setIntervalError(`${REMIND_INTERVAL_MIN}〜${REMIND_INTERVAL_MAX}の範囲で入力してください`);
      return;
    }
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
            未チェックの項目を、目安時刻を過ぎてから何分おきに再通知するかを設定します(
            {REMIND_INTERVAL_MIN}〜{REMIND_INTERVAL_MAX}分、{REMIND_INTERVAL_STEP}分刻み)。
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="number"
              min={REMIND_INTERVAL_MIN}
              max={REMIND_INTERVAL_MAX}
              step={REMIND_INTERVAL_STEP}
              value={intervalInput}
              disabled={intervalSaving}
              onChange={(e) => setIntervalInput(e.target.value)}
              style={{ width: 90 }}
            />
            <span>分おき</span>
            <button className="primary" onClick={saveReminderInterval} disabled={intervalSaving}>
              保存する
            </button>
          </div>
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
