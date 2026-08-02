import { useState } from "react";
import { useChecklistForDate } from "../lib/useChecklistForDate";
import { TIME_SLOT_LABEL, TIME_SLOT_ORDER, type TimeSlot } from "../types/models";
import { addDaysJST, formatDateJa, formatTime, todayInTokyo } from "../lib/dateUtils";
import { errorMessage } from "../lib/errorMessage";
import NotificationSetup from "../components/NotificationSetup";
import type { Member } from "../types/models";

export default function ChildChecklistView({ member }: { member: Member }) {
  const today = todayInTokyo();
  const [date, setDate] = useState(today);
  const isToday = date === today;
  const { entries, loading, error, toggleCheck } = useChecklistForDate(member.family_id, date);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const bySlot = (slot: TimeSlot) => entries.filter((e) => e.template.time_slot === slot);

  async function handleToggle(templateId: string, checked: boolean) {
    if (!isToday || pendingId) return;
    setPendingId(templateId);
    setToggleError(null);
    try {
      await toggleCheck(templateId, member.id, checked);
    } catch (e) {
      setToggleError(errorMessage(e));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="screen">
      <h1>やること</h1>
      <NotificationSetup member={member} />

      <div className="date-nav">
        <button onClick={() => setDate((d) => addDaysJST(d, -1))}>← 前の日</button>
        <span>{formatDateJa(date)}</span>
        <button onClick={() => setDate((d) => addDaysJST(d, 1))} disabled={isToday}>
          次の日 →
        </button>
      </div>
      {!isToday && (
        <p className="notice">過去の記録を表示しています(チェックの変更は今日の分のみ可能です)</p>
      )}

      {error && <p className="error">{error}</p>}
      {toggleError && <p className="error">{toggleError}</p>}
      {loading && <p>読み込み中...</p>}
      {!loading && entries.length === 0 && <p className="notice">まだ項目が設定されていません。</p>}
      {TIME_SLOT_ORDER.map((slot) => {
        const items = bySlot(slot);
        if (items.length === 0) return null;
        return (
          <section key={slot}>
            <h2>{TIME_SLOT_LABEL[slot]}</h2>
            {items.map(({ template, status }) => {
              const checked = !!status?.checked_at;
              return (
                <button
                  key={template.id}
                  type="button"
                  className={`task-item${checked ? " checked" : ""}`}
                  onClick={() => handleToggle(template.id, !checked)}
                  disabled={!isToday || pendingId === template.id}
                  aria-pressed={checked}
                >
                  <span className="checkbox">{checked ? "✓" : ""}</span>
                  <span className="title">{template.title}</span>
                  <span className="time">{formatTime(template.target_time)}</span>
                </button>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
