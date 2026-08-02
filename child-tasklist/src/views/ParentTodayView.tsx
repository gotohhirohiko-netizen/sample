import { useTodayChecklist } from "../lib/useTodayChecklist";
import { TIME_SLOT_LABEL, TIME_SLOT_ORDER, type TimeSlot } from "../types/models";
import { formatTime } from "../lib/dateUtils";

export default function ParentTodayView({ familyId }: { familyId: string }) {
  const { entries, loading, error } = useTodayChecklist(familyId);

  const bySlot = (slot: TimeSlot) => entries.filter((e) => e.template.time_slot === slot);
  const doneCount = entries.filter((e) => e.status?.checked_at).length;

  return (
    <div>
      <h1>今日の進捗</h1>
      {error && <p className="error">{error}</p>}
      {loading && <p>読み込み中...</p>}
      {!loading && entries.length === 0 && (
        <p className="notice">まだ項目が設定されていません。「項目設定」タブから追加してください。</p>
      )}
      {!loading && entries.length > 0 && (
        <p className="notice">
          {doneCount} / {entries.length} 完了
        </p>
      )}
      {TIME_SLOT_ORDER.map((slot) => {
        const items = bySlot(slot);
        if (items.length === 0) return null;
        return (
          <section key={slot}>
            <h2>{TIME_SLOT_LABEL[slot]}</h2>
            {items.map(({ template, status }) => {
              const checked = !!status?.checked_at;
              return (
                <div key={template.id} className={`task-item${checked ? " checked" : ""}`}>
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
