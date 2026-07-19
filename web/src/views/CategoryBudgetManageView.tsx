import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { budgetAmount } from "../lib/budgetCalculator";
import { formatYearMonth, formatYen, monthToParam } from "../lib/dateUtils";
import type { CategoryBudgetSetting } from "../types/models";

function monthParamToDate(param: string): Date {
  const [year, month] = param.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

/** 2つの期間([from, to]。toがnullなら無期限)が重なるかどうか */
function rangesOverlap(
  aFrom: string,
  aTo: string | null,
  bFrom: string,
  bTo: string | null
): boolean {
  const aFromT = new Date(aFrom).getTime();
  const aToT = aTo ? new Date(aTo).getTime() : Infinity;
  const bFromT = new Date(bFrom).getTime();
  const bToT = bTo ? new Date(bTo).getTime() : Infinity;
  return aFromT <= bToT && bFromT <= aToT;
}

/** カテゴリ・予算管理画面(要件定義書 4.6)。1カテゴリに複数の期間指定予算計画を持てる */
export default function CategoryBudgetManageView() {
  const majorCategories = useLiveQuery(
    () => db.majorCategories.orderBy("displayOrder").toArray(),
    []
  );
  const subcategories = useLiveQuery(() => db.subcategories.toArray(), []);
  const budgetSettings = useLiveQuery(() => db.categoryBudgetSettings.toArray(), []);

  const [newMajorName, setNewMajorName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [newAmount, setNewAmount] = useState("");
  const [newFrom, setNewFrom] = useState(() => monthToParam(new Date()));
  const [newTo, setNewTo] = useState("");
  const [newSubName, setNewSubName] = useState("");

  async function addMajorCategory() {
    if (!majorCategories || newMajorName.trim() === "") return;
    const order = Math.max(-1, ...majorCategories.map((c) => c.displayOrder)) + 1;
    await db.majorCategories.add({ id: crypto.randomUUID(), name: newMajorName.trim(), displayOrder: order });
    setNewMajorName("");
  }

  function resetPlanForm() {
    setEditingPlanId(null);
    setNewAmount("");
    setNewFrom(monthToParam(new Date()));
    setNewTo("");
  }

  function startEditPlan(plan: CategoryBudgetSetting) {
    setEditingPlanId(plan.id);
    setNewAmount(String(plan.monthlyAmount));
    setNewFrom(monthToParam(new Date(plan.effectiveFrom)));
    setNewTo(plan.effectiveTo ? monthToParam(new Date(plan.effectiveTo)) : "");
  }

  /**
   * 新しい期間の開始月の前月までに、無期限だった過去の計画を自動的に
   * 短縮するとした場合の、それでもなお重なる計画(=保存をブロックすべき計画)を求める。
   */
  function resolveOverlaps(
    majorCategoryID: string,
    effectiveFromDate: Date,
    effectiveTo: string | null,
    excludeId: string | null
  ): { toAutoCap: CategoryBudgetSetting[]; blocking: CategoryBudgetSetting[]; cappedTo: string } {
    const effectiveFrom = effectiveFromDate.toISOString();
    const toAutoCap = (budgetSettings ?? []).filter(
      (s) =>
        s.majorCategoryID === majorCategoryID &&
        s.id !== excludeId &&
        s.effectiveTo === null &&
        new Date(s.effectiveFrom) < effectiveFromDate
    );
    const cappedTo = new Date(
      effectiveFromDate.getFullYear(),
      effectiveFromDate.getMonth() - 1,
      1
    ).toISOString();
    const cappedIds = new Set(toAutoCap.map((p) => p.id));

    const blocking = (budgetSettings ?? []).filter((s) => {
      if (s.majorCategoryID !== majorCategoryID || s.id === excludeId) return false;
      const effectiveToForCheck = cappedIds.has(s.id) ? cappedTo : s.effectiveTo;
      return rangesOverlap(effectiveFrom, effectiveTo, s.effectiveFrom, effectiveToForCheck);
    });

    return { toAutoCap, blocking, cappedTo };
  }

  function currentResolution(majorCategoryID: string) {
    if (!newFrom) return null;
    const effectiveTo = newTo ? monthParamToDate(newTo).toISOString() : null;
    return resolveOverlaps(majorCategoryID, monthParamToDate(newFrom), effectiveTo, editingPlanId);
  }

  async function addOrUpdateBudgetPlan(majorCategoryID: string) {
    const amount = Number(newAmount);
    if (!newFrom || !Number.isFinite(amount)) return;
    if (newTo && newTo < newFrom) return;
    const effectiveFromDate = monthParamToDate(newFrom);
    const effectiveFrom = effectiveFromDate.toISOString();
    const effectiveTo = newTo ? monthParamToDate(newTo).toISOString() : null;

    const { toAutoCap, blocking, cappedTo } = resolveOverlaps(
      majorCategoryID,
      effectiveFromDate,
      effectiveTo,
      editingPlanId
    );
    if (blocking.length > 0) return;

    await db.transaction("rw", db.categoryBudgetSettings, async () => {
      for (const plan of toAutoCap) {
        await db.categoryBudgetSettings.update(plan.id, { effectiveTo: cappedTo });
      }
      if (editingPlanId) {
        await db.categoryBudgetSettings.update(editingPlanId, {
          monthlyAmount: amount,
          effectiveFrom,
          effectiveTo,
        });
      } else {
        await db.categoryBudgetSettings.add({
          id: crypto.randomUUID(),
          majorCategoryID,
          monthlyAmount: amount,
          effectiveFrom,
          effectiveTo,
        });
      }
    });
    resetPlanForm();
  }

  async function deleteBudgetPlan(id: string) {
    if (!confirm("この予算計画を削除しますか?")) return;
    await db.categoryBudgetSettings.delete(id);
    if (editingPlanId === id) resetPlanForm();
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

  const totalCurrentBudget = majorCategories.reduce(
    (sum, major) => sum + (budgetAmount(major.id, new Date(), budgetSettings) ?? 0),
    0
  );

  return (
    <div>
      <Link to="/settings" className="back-link">
        ‹ 設定へ戻る
      </Link>
      <h1 className="screen-title">カテゴリ・予算管理</h1>

      <div className="section card">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <strong>トータル(今月の予算合計)</strong>
          <span className="amount">{formatYen(totalCurrentBudget)}</span>
        </div>
      </div>

      <div className="list">
        {majorCategories.map((major) => {
          const current = budgetAmount(major.id, new Date(), budgetSettings);
          const expanded = expandedId === major.id;
          const plans = budgetSettings
            .filter((s) => s.majorCategoryID === major.id)
            .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
          const resolution = expanded ? currentResolution(major.id) : null;

          return (
            <div key={major.id} className="card">
              <button
                type="button"
                className="list-row"
                style={{ border: "none", padding: 0, background: "none" }}
                onClick={() => {
                  if (expanded) {
                    resetPlanForm();
                    setExpandedId(null);
                  } else {
                    setExpandedId(major.id);
                  }
                }}
              >
                <span>{major.name}</span>
                <span className="muted">{current !== undefined ? formatYen(current) : "未設定"}</span>
              </button>

              {expanded && (
                <div style={{ marginTop: 12 }}>
                  <div className="section-title">予算計画</div>
                  {plans.length > 0 && (
                    <div className="list" style={{ marginBottom: 12 }}>
                      {plans.map((plan) => (
                        <div
                          key={plan.id}
                          className="list-row"
                          style={editingPlanId === plan.id ? { borderColor: "var(--accent)" } : undefined}
                        >
                          <div>
                            <div>{formatYen(plan.monthlyAmount)}</div>
                            <div className="muted">
                              {formatYearMonth(new Date(plan.effectiveFrom))} 〜{" "}
                              {plan.effectiveTo ? formatYearMonth(new Date(plan.effectiveTo)) : "無期限"}
                            </div>
                          </div>
                          <div className="button-row">
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => startEditPlan(plan)}
                            >
                              編集
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => deleteBudgetPlan(plan.id)}
                            >
                              削除
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="form-row">
                    <label>{editingPlanId ? "予算計画を編集" : "新しい予算計画を追加"}</label>
                    <input
                      type="number"
                      value={newAmount}
                      onChange={(e) => setNewAmount(e.target.value)}
                      placeholder="円"
                    />
                  </div>
                  <div className="form-row">
                    <label>いつから</label>
                    <input type="month" value={newFrom} onChange={(e) => setNewFrom(e.target.value)} />
                  </div>
                  <div className="form-row">
                    <label>いつまで(空欄で無期限)</label>
                    <input type="month" value={newTo} onChange={(e) => setNewTo(e.target.value)} />
                  </div>

                  {resolution && resolution.toAutoCap.length > 0 && (
                    <p className="muted">
                      {resolution.toAutoCap
                        .map((p) => formatYen(p.monthlyAmount))
                        .join("、")}
                      (無期限)の計画は、自動的に{formatYearMonth(new Date(resolution.cappedTo))}までに短縮されます
                    </p>
                  )}
                  {resolution && resolution.blocking.length > 0 && (
                    <p className="muted" style={{ color: "var(--danger)" }}>
                      {resolution.blocking
                        .map(
                          (p) =>
                            `${formatYearMonth(new Date(p.effectiveFrom))}〜${p.effectiveTo ? formatYearMonth(new Date(p.effectiveTo)) : "無期限"}(${formatYen(p.monthlyAmount)})`
                        )
                        .join("、")}
                      の計画と期間が重なるため保存できません。期間を調整するか、対象の計画を編集・削除してください。
                    </p>
                  )}

                  <div className="button-row">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => addOrUpdateBudgetPlan(major.id)}
                      disabled={!!resolution && resolution.blocking.length > 0}
                    >
                      {editingPlanId ? "更新" : "追加"}
                    </button>
                    {editingPlanId && (
                      <button type="button" className="btn-secondary" onClick={resetPlanForm}>
                        キャンセル
                      </button>
                    )}
                  </div>
                  <p className="muted">
                    複数の期間の予算計画を持てます。過去月の実績評価には遡って影響しません
                  </p>

                  <div className="section-title" style={{ marginTop: 16 }}>
                    小カテゴリ
                  </div>
                  <ul>
                    {subcategories
                      .filter((s) => s.majorCategoryID === major.id)
                      .map((sub) => (
                        <li key={sub.id}>{sub.name}</li>
                      ))}
                  </ul>
                  <div className="button-row">
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
        <div className="button-row">
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
