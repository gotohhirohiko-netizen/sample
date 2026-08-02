import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { TIME_SLOT_LABEL, TIME_SLOT_ORDER, type TaskTemplate, type TimeSlot } from "../types/models";

const DEFAULT_TARGET_TIME: Record<TimeSlot, string> = {
  morning: "07:00",
  noon: "12:00",
  evening: "20:00",
};

export default function ParentSetupView({ familyId }: { familyId: string }) {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newSlot, setNewSlot] = useState<TimeSlot>("morning");
  const [newTime, setNewTime] = useState(DEFAULT_TARGET_TIME.morning);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("task_templates")
      .select("*")
      .eq("family_id", familyId)
      .eq("active", true)
      .order("time_slot")
      .order("target_time");
    if (fetchError) setError(fetchError.message);
    else setTemplates(data ?? []);
    setLoading(false);
  }, [familyId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addTemplate() {
    if (!newTitle.trim()) return;
    const maxOrder = Math.max(0, ...templates.map((t) => t.display_order));
    const { error: insertError } = await supabase.from("task_templates").insert({
      family_id: familyId,
      title: newTitle.trim(),
      time_slot: newSlot,
      target_time: `${newTime}:00`,
      display_order: maxOrder + 1,
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setNewTitle("");
    await load();
  }

  async function removeTemplate(id: string) {
    const { error: updateError } = await supabase
      .from("task_templates")
      .update({ active: false })
      .eq("id", id);
    if (updateError) setError(updateError.message);
    else await load();
  }

  return (
    <div>
      <h1>項目設定</h1>
      {error && <p className="error">{error}</p>}
      {loading && <p>読み込み中...</p>}

      {TIME_SLOT_ORDER.map((slot) => {
        const items = templates.filter((t) => t.time_slot === slot);
        if (items.length === 0) return null;
        return (
          <section key={slot}>
            <h2>{TIME_SLOT_LABEL[slot]}</h2>
            {items.map((t) => (
              <div key={t.id} className="task-item">
                <div className="title">{t.title}</div>
                <div className="time">{t.target_time.slice(0, 5)}</div>
                <button onClick={() => removeTemplate(t.id)}>削除</button>
              </div>
            ))}
          </section>
        );
      })}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>項目を追加</h2>
        <input
          type="text"
          placeholder="例: 歯みがき"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <select
            value={newSlot}
            onChange={(e) => {
              const slot = e.target.value as TimeSlot;
              setNewSlot(slot);
              setNewTime(DEFAULT_TARGET_TIME[slot]);
            }}
          >
            {TIME_SLOT_ORDER.map((slot) => (
              <option key={slot} value={slot}>
                {TIME_SLOT_LABEL[slot]}
              </option>
            ))}
          </select>
          <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
        </div>
        <button className="primary" onClick={addTemplate} disabled={!newTitle.trim()}>
          追加する
        </button>
      </div>
    </div>
  );
}
