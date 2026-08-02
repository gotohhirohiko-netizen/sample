import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { errorMessage } from "../lib/errorMessage";
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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSlot, setEditSlot] = useState<TimeSlot>("morning");
  const [editTime, setEditTime] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("task_templates")
      .select("*")
      .eq("family_id", familyId)
      .eq("active", true)
      .order("time_slot")
      .order("target_time")
      .order("display_order");
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

  function startEdit(t: TaskTemplate) {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditSlot(t.time_slot);
    setEditTime(t.target_time.slice(0, 5));
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    if (!editTitle.trim()) return;
    const { error: updateError } = await supabase
      .from("task_templates")
      .update({
        title: editTitle.trim(),
        time_slot: editSlot,
        target_time: `${editTime}:00`,
      })
      .eq("id", id);
    if (updateError) {
      setError(errorMessage(updateError));
      return;
    }
    setEditingId(null);
    await load();
  }

  async function moveItem(item: TaskTemplate, direction: -1 | 1) {
    const siblings = templates.filter((t) => t.time_slot === item.time_slot);
    const index = siblings.findIndex((t) => t.id === item.id);
    const swapWith = siblings[index + direction];
    if (!swapWith) return;
    const { error: e1 } = await supabase
      .from("task_templates")
      .update({ display_order: swapWith.display_order })
      .eq("id", item.id);
    const { error: e2 } = await supabase
      .from("task_templates")
      .update({ display_order: item.display_order })
      .eq("id", swapWith.id);
    if (e1 || e2) {
      setError(errorMessage(e1 ?? e2));
      return;
    }
    await load();
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
            {items.map((t, i) =>
              editingId === t.id ? (
                <div key={t.id} className="card">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    style={{ marginBottom: 10 }}
                  />
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <select
                      value={editSlot}
                      onChange={(e) => setEditSlot(e.target.value as TimeSlot)}
                    >
                      {TIME_SLOT_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {TIME_SLOT_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="time"
                      value={editTime}
                      onChange={(e) => setEditTime(e.target.value)}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={cancelEdit}>キャンセル</button>
                    <button
                      className="primary"
                      onClick={() => saveEdit(t.id)}
                      disabled={!editTitle.trim()}
                    >
                      保存する
                    </button>
                  </div>
                </div>
              ) : (
                <div key={t.id} className="task-item">
                  <div className="title">{t.title}</div>
                  <div className="time">{t.target_time.slice(0, 5)}</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => moveItem(t, -1)} disabled={i === 0} aria-label="上に移動">
                      ↑
                    </button>
                    <button
                      onClick={() => moveItem(t, 1)}
                      disabled={i === items.length - 1}
                      aria-label="下に移動"
                    >
                      ↓
                    </button>
                    <button onClick={() => startEdit(t)}>編集</button>
                    <button onClick={() => removeTemplate(t.id)}>削除</button>
                  </div>
                </div>
              ),
            )}
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
