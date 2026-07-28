import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";

/** ボーナス計画一覧画面。計画(集計対象月の期間)を選択すると詳細画面に遷移する */
export default function BonusPlanListView() {
  const navigate = useNavigate();
  const bonusPeriods = useLiveQuery(() => db.bonusPeriods.orderBy("displayOrder").toArray(), []);

  const [newLabel, setNewLabel] = useState("");
  const [newStartMonth, setNewStartMonth] = useState("1");
  const [newEndMonth, setNewEndMonth] = useState("6");

  if (!bonusPeriods) {
    return <p className="muted">読み込み中...</p>;
  }

  async function addPlan() {
    const startMonth = Number(newStartMonth);
    const endMonth = Number(newEndMonth);
    if (newLabel.trim() === "") return;
    if (!Number.isInteger(startMonth) || !Number.isInteger(endMonth)) return;
    if (startMonth < 1 || startMonth > 12 || endMonth < 1 || endMonth > 12) return;
    if (startMonth > endMonth) return;

    const order = Math.max(-1, ...bonusPeriods!.map((p) => p.displayOrder)) + 1;
    await db.bonusPeriods.add({
      id: crypto.randomUUID(),
      label: newLabel.trim(),
      startMonth,
      endMonth,
      displayOrder: order,
    });
    setNewLabel("");
    setNewStartMonth("1");
    setNewEndMonth("6");
  }

  return (
    <div>
      <h1 className="screen-title">ボーナス計画</h1>

      <div className="list">
        {bonusPeriods.map((period) => (
          <button
            key={period.id}
            type="button"
            className="list-row"
            onClick={() => navigate(`/bonus/${period.id}`)}
          >
            <div>{period.label}</div>
            <span className="muted">{period.startMonth}月〜{period.endMonth}月 ›</span>
          </button>
        ))}
        {bonusPeriods.length === 0 && <p className="muted">ボーナス計画がまだありません</p>}
      </div>

      <div className="section" style={{ marginTop: 16 }}>
        <div className="section-title">ボーナス計画を追加</div>
        <div className="form-row">
          <label>名称</label>
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="例: 1-6月" />
        </div>
        <div className="form-row">
          <label>集計対象月(開始月〜終了月)</label>
          <div className="button-row">
            <input
              type="number"
              min={1}
              max={12}
              value={newStartMonth}
              onChange={(e) => setNewStartMonth(e.target.value)}
            />
            <span>〜</span>
            <input
              type="number"
              min={1}
              max={12}
              value={newEndMonth}
              onChange={(e) => setNewEndMonth(e.target.value)}
            />
          </div>
        </div>
        <button type="button" className="btn-primary" onClick={addPlan}>
          追加
        </button>
      </div>
    </div>
  );
}
