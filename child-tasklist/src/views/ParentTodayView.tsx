import { useState } from "react";
import { useChecklistForDate } from "../lib/useChecklistForDate";
import { TIME_SLOT_LABEL, TIME_SLOT_ORDER, type TimeSlot } from "../types/models";
import { addDaysJST, formatDateJa, formatTime, todayInTokyo } from "../lib/dateUtils";

export default function ParentTodayView({ familyId }: { familyId: string }) {
  const today = todayInTokyo();
  const [date, setDate] = useState(today);
  const isToday = date === today;
  const { entries, activeList, loading, error } = useChecklistForDate(familyId, date);

  const bySlot = (slot: TimeSlot) => entries.filter((e) => e.template.time_slot === slot);
  const doneCount = entries.filter((e) => e.status?.checked_at).length;

  return (
    <div>
      <h1>進捗</h1>

      <div className="date-nav">
        <button onClick={() => setDate((d) => addDaysJST(d, -1))}>← 前の日</button>
        <span>{formatDateJa(date)}</span>
        <button onClick={() => setDate((d) => addDaysJST(d, 1))} disabled={isToday}>
          次の日 →
        </button>
      </div>

      {activeList && !activeList.is_default && (
        <p className="notice">
          特別リスト「{activeList.name}」({activeList.start_date?.slice(5)}〜{activeList.end_date?.slice(5)})が適用中です
        </p>
      )}

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
                  <span className="checkbox">{checked ? "✓" : ""}</span>
                  <span className="title">{template.title}</span>
                  <span className="time">{formatTime(template.target_time)}</span>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
