import { useTodayChecklist } from "../lib/useTodayChecklist";
import { TIME_SLOT_LABEL, TIME_SLOT_ORDER, type TimeSlot } from "../types/models";
import { formatTime } from "../lib/dateUtils";
import NotificationSetup from "../components/NotificationSetup";
import type { Member } from "../types/models";

export default function ChildChecklistView({ member }: { member: Member }) {
  const { entries, loading, error, toggleCheck } = useTodayChecklist(member.family_id);

  const bySlot = (slot: TimeSlot) => entries.filter((e) => e.template.time_slot === slot);

  return (
    <div className="screen">
      <h1>今日のやること</h1>
      <NotificationSetup member={member} />
      {error && <p className="error">{error}</p>}
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
                <div
                  key={template.id}
                  className={`task-item${checked ? " checked" : ""}`}
                  onClick={() => toggleCheck(template.id, member.id, !checked)}
                  role="checkbox"
                  aria-checked={checked}
                >
                  <div className="checkbox">{checked ? "✓" : ""}</div>
                  <div className="title">{template.title}</div>
                  <div className="time">{formatTime(template.target_time)}</div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
