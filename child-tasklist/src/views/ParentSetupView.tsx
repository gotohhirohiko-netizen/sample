import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { errorMessage } from "../lib/errorMessage";
import { findOverlappingList } from "../lib/taskLists";
import { TIME_SLOT_LABEL, TIME_SLOT_ORDER, type TaskList, type TaskTemplate, type TimeSlot } from "../types/models";

const DEFAULT_TARGET_TIME: Record<TimeSlot, string> = {
  morning: "07:00",
  noon: "12:00",
  evening: "20:00",
};

function formatPeriod(list: TaskList): string {
  if (list.is_default || !list.start_date || !list.end_date) return "";
  return `${list.start_date.slice(5)} 〜 ${list.end_date.slice(5)}`;
}

export default function ParentSetupView({ familyId }: { familyId: string }) {
  const [lists, setLists] = useState<TaskList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newListName, setNewListName] = useState("");
  const [newListStart, setNewListStart] = useState("");
  const [newListEnd, setNewListEnd] = useState("");

  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editListName, setEditListName] = useState("");
  const [editListStart, setEditListStart] = useState("");
  const [editListEnd, setEditListEnd] = useState("");

  const [newTitle, setNewTitle] = useState("");
  const [newSlot, setNewSlot] = useState<TimeSlot>("morning");
  const [newTime, setNewTime] = useState(DEFAULT_TARGET_TIME.morning);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSlot, setEditSlot] = useState<TimeSlot>("morning");
  const [editTime, setEditTime] = useState("");

  const loadLists = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("task_lists")
      .select("*")
      .eq("family_id", familyId)
      .order("is_default", { ascending: false })
      .order("start_date");
    if (fetchError) {
      setError(errorMessage(fetchError));
      return;
    }
    setLists(data ?? []);
    setSelectedListId((current) => current ?? data?.find((l) => l.is_default)?.id ?? data?.[0]?.id ?? null);
  }, [familyId]);

  const loadTemplates = useCallback(async () => {
    if (!selectedListId) {
      setTemplates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("task_templates")
      .select("*")
      .eq("list_id", selectedListId)
      .eq("active", true)
      .order("time_slot")
      .order("target_time")
      .order("display_order");
    if (fetchError) setError(errorMessage(fetchError));
    else setTemplates(data ?? []);
    setLoading(false);
  }, [selectedListId]);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  async function addList() {
    if (!newListName.trim() || !newListStart || !newListEnd) return;
    if (newListEnd < newListStart) {
      setError("終了日は開始日以降にしてください");
      return;
    }
    const overlapping = findOverlappingList(lists, newListStart, newListEnd);
    if (overlapping) {
      setError(`「${overlapping.name}」と期間が重なっています`);
      return;
    }
    const { data, error: insertError } = await supabase
      .from("task_lists")
      .insert({
        family_id: familyId,
        name: newListName.trim(),
        is_default: false,
        start_date: newListStart,
        end_date: newListEnd,
      })
      .select()
      .single();
    if (insertError) {
      setError(errorMessage(insertError));
      return;
    }
    setNewListName("");
    setNewListStart("");
    setNewListEnd("");
    await loadLists();
    if (data) setSelectedListId(data.id);
  }

  function startEditList(list: TaskList) {
    setEditingListId(list.id);
    setEditListName(list.name);
    setEditListStart(list.start_date ?? "");
    setEditListEnd(list.end_date ?? "");
  }

  async function saveEditList(list: TaskList) {
    if (!editListName.trim() || !editListStart || !editListEnd) return;
    if (editListEnd < editListStart) {
      setError("終了日は開始日以降にしてください");
      return;
    }
    const overlapping = findOverlappingList(lists, editListStart, editListEnd, list.id);
    if (overlapping) {
      setError(`「${overlapping.name}」と期間が重なっています`);
      return;
    }
    const { error: updateError } = await supabase
      .from("task_lists")
      .update({ name: editListName.trim(), start_date: editListStart, end_date: editListEnd })
      .eq("id", list.id);
    if (updateError) {
      setError(errorMessage(updateError));
      return;
    }
    setEditingListId(null);
    await loadLists();
  }

  async function deleteList(list: TaskList) {
    if (!window.confirm(`「${list.name}」を削除しますか?含まれる項目もすべて削除されます。`)) return;
    const { error: deleteError } = await supabase.from("task_lists").delete().eq("id", list.id);
    if (deleteError) {
      setError(errorMessage(deleteError));
      return;
    }
    if (selectedListId === list.id) setSelectedListId(null);
    await loadLists();
  }

  async function addTemplate() {
    if (!newTitle.trim() || !selectedListId) return;
    const maxOrder = Math.max(0, ...templates.map((t) => t.display_order));
    const { error: insertError } = await supabase.from("task_templates").insert({
      family_id: familyId,
      list_id: selectedListId,
      title: newTitle.trim(),
      time_slot: newSlot,
      target_time: `${newTime}:00`,
      display_order: maxOrder + 1,
    });
    if (insertError) {
      setError(errorMessage(insertError));
      return;
    }
    setNewTitle("");
    await loadTemplates();
  }

  async function removeTemplate(id: string) {
    const { error: updateError } = await supabase
      .from("task_templates")
      .update({ active: false })
      .eq("id", id);
    if (updateError) setError(errorMessage(updateError));
    else await loadTemplates();
  }

  function startEditItem(t: TaskTemplate) {
    setEditingItemId(t.id);
    setEditTitle(t.title);
    setEditSlot(t.time_slot);
    setEditTime(t.target_time.slice(0, 5));
  }

  async function saveEditItem(id: string) {
    if (!editTitle.trim()) return;
    const { error: updateError } = await supabase
      .from("task_templates")
      .update({ title: editTitle.trim(), time_slot: editSlot, target_time: `${editTime}:00` })
      .eq("id", id);
    if (updateError) {
      setError(errorMessage(updateError));
      return;
    }
    setEditingItemId(null);
    await loadTemplates();
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
    await loadTemplates();
  }

  const selectedList = lists.find((l) => l.id === selectedListId) ?? null;

  return (
    <div>
      <h1>タスクリスト・項目設定</h1>
      {error && <p className="error">{error}</p>}

      <section>
        <h2>編集するリスト</h2>
        <select
          value={selectedListId ?? ""}
          onChange={(e) => setSelectedListId(e.target.value)}
          style={{ marginBottom: 12 }}
        >
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.is_default ? l.name : `${l.name}(${formatPeriod(l)})`}
            </option>
          ))}
        </select>

        {lists
          .filter((l) => !l.is_default)
          .map((l) =>
            editingListId === l.id ? (
              <div key={l.id} className="card">
                <input
                  type="text"
                  value={editListName}
                  onChange={(e) => setEditListName(e.target.value)}
                  style={{ marginBottom: 10 }}
                />
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input
                    type="date"
                    value={editListStart}
                    onChange={(e) => setEditListStart(e.target.value)}
                  />
                  <input type="date" value={editListEnd} onChange={(e) => setEditListEnd(e.target.value)} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setEditingListId(null)}>キャンセル</button>
                  <button className="primary" onClick={() => saveEditList(l)}>
                    保存する
                  </button>
                </div>
              </div>
            ) : (
              <div key={l.id} className="task-item">
                <div className="title">{l.name}</div>
                <div className="time">{formatPeriod(l)}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => startEditList(l)}>編集</button>
                  <button onClick={() => deleteList(l)}>削除</button>
                </div>
              </div>
            ),
          )}

        <div className="card">
          <h2 style={{ marginTop: 0 }}>特別リストを追加</h2>
          <p className="notice">
            期間限定のタスクリストです(例: 遠征・合宿)。設定した期間はこちらが優先され、期間外は通常のタスクリストに戻ります。
          </p>
          <input
            type="text"
            placeholder="例: 沖縄遠征"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            style={{ marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input type="date" value={newListStart} onChange={(e) => setNewListStart(e.target.value)} />
            <input type="date" value={newListEnd} onChange={(e) => setNewListEnd(e.target.value)} />
          </div>
          <button
            className="primary"
            onClick={addList}
            disabled={!newListName.trim() || !newListStart || !newListEnd}
          >
            追加する
          </button>
        </div>
      </section>

      <section>
        <h2>
          項目{selectedList && !selectedList.is_default ? `(${selectedList.name})` : ""}
        </h2>
        {loading && <p>読み込み中...</p>}

        {TIME_SLOT_ORDER.map((slot) => {
          const items = templates.filter((t) => t.time_slot === slot);
          if (items.length === 0) return null;
          return (
            <section key={slot}>
              <h2>{TIME_SLOT_LABEL[slot]}</h2>
              {items.map((t, i) =>
                editingItemId === t.id ? (
                  <div key={t.id} className="card">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      style={{ marginBottom: 10 }}
                    />
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                      <select value={editSlot} onChange={(e) => setEditSlot(e.target.value as TimeSlot)}>
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
                      <button onClick={() => setEditingItemId(null)}>キャンセル</button>
                      <button
                        className="primary"
                        onClick={() => saveEditItem(t.id)}
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
                      <button onClick={() => startEditItem(t)}>編集</button>
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
      </section>
    </div>
  );
}
