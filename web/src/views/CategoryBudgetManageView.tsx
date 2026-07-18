import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { budgetAmount } from "../lib/budgetCalculator";
import { formatYen, startOfMonth } from "../lib/dateUtils";

/** カテゴリ・予算管理画面(要件定義書 4.6) */
export default function CategoryBudgetManageView() {
  const majorCategories = useLiveQuery(
    () => db.majorCategories.orderBy("displayOrder").toArray(),
    []
  );
  const subcategories = useLiveQuery(() => db.subcategories.toArray(), []);
  const budgetSettings = useLiveQuery(() => db.categoryBudgetSettings.toArray(), []);

  const [newMajorName, setNewMajorName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [newSubName, setNewSubName] = useState("");

  async function addMajorCategory() {
    if (!majorCategories || newMajorName.trim() === "") return;
    const order = Math.max(-1, ...majorCategories.map((c) => c.displayOrder)) + 1;
    await db.majorCategories.add({ id: crypto.randomUUID(), name: newMajorName.trim(), displayOrder: order });
    setNewMajorName("");
  }

  async function updateBudget(majorCategoryID: string) {
    const amount = Number(budgetInput);
    if (!Number.isFinite(amount)) return;
    await db.categoryBudgetSettings.add({
      id: crypto.randomUUID(),
      majorCategoryID,
      monthlyAmount: amount,
      effectiveFrom: startOfMonth(new Date()).toISOString(),
    });
    setBudgetInput("");
  }

  async function addSubcategory(majorCategoryID: string) {
    if (!subcategories || newSubName.trim() === "") return;
    const siblings = subcategories.filter((s) => s.majorCategoryID === majorCategoryID);
    const order = Math.max(-1, ...siblings.map((s) => s.displayOrder)) + 1;
    await db.subcategories.add({
      id: crypto.randomUUID(),
      majorCategoryID,
      name: newSubName.trim(),
      displayOrder: order,
    });
    setNewSubName("");
  }

  if (!majorCategories || !subcategories || !budgetSettings) {
    return <p className="muted">読み込み中...</p>;
  }

  return (
    <div>
      <Link to="/settings" className="back-link">
        ‹ 設定へ戻る
      </Link>
      <h1 className="screen-title">カテゴリ・予算管理</h1>

      <div className="list">
        {majorCategories.map((major) => {
          const current = budgetAmount(major.id, new Date(), budgetSettings);
          const expanded = expandedId === major.id;
          return (
            <div key={major.id} className="card">
              <button
                type="button"
                className="list-row"
                style={{ border: "none", padding: 0, background: "none" }}
                onClick={() => setExpandedId(expanded ? null : major.id)}
              >
                <span>{major.name}</span>
                <span className="muted">{current !== undefined ? formatYen(current) : "未設定"}</span>
              </button>

              {expanded && (
                <div style={{ marginTop: 12 }}>
                  <div className="form-row">
                    <label>今月以降の予算額</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="number"
                        value={budgetInput}
                        onChange={(e) => setBudgetInput(e.target.value)}
                        placeholder="円"
                      />
                      <button type="button" className="btn-secondary" onClick={() => updateBudget(major.id)}>
                        更新
                      </button>
                    </div>
                    <p className="muted">
                      変更は今月以降にのみ適用され、過去月の実績評価は変わりません
                    </p>
                  </div>

                  <div className="section-title">小カテゴリ</div>
                  <ul>
                    {subcategories
                      .filter((s) => s.majorCategoryID === major.id)
                      .map((sub) => (
                        <li key={sub.id}>{sub.name}</li>
                      ))}
                  </ul>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={newSubName}
                      onChange={(e) => setNewSubName(e.target.value)}
                      placeholder="小カテゴリ名"
                    />
                    <button type="button" className="btn-secondary" onClick={() => addSubcategory(major.id)}>
                      追加
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="section" style={{ marginTop: 16 }}>
        <div className="section-title">大カテゴリを追加</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={newMajorName}
            onChange={(e) => setNewMajorName(e.target.value)}
            placeholder="カテゴリ名"
          />
          <button type="button" className="btn-secondary" onClick={addMajorCategory}>
            追加
          </button>
        </div>
      </div>
    </div>
  );
}
