import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import {
  bonusActualAmount,
  bonusBudgetAmount,
  bonusCategoryActualAmount,
  bonusCategoryPlanAmount,
  bonusPeriodRange,
} from "../lib/bonusCalculator";
import { formatYen } from "../lib/dateUtils";
import type { BonusPeriod } from "../types/models";
import TransactionRow from "../components/TransactionRow";

/** ボーナス払いの予実確認・設定画面 */
export default function BonusBudgetView() {
  const bonusPeriods = useLiveQuery(() => db.bonusPeriods.orderBy("displayOrder").toArray(), []);
  const bonusBudgetSettings = useLiveQuery(() => db.bonusBudgetSettings.toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const fundingSources = useLiveQuery(() => db.fundingSources.toArray(), []);
  const subcategories = useLiveQuery(() => db.subcategories.toArray(), []);
  const majorCategories = useLiveQuery(() => db.majorCategories.toArray(), []);
  const bonusCategoryPlans = useLiveQuery(() => db.bonusCategoryPlans.toArray(), []);

  const [budgetInputs, setBudgetInputs] = useState<Record<string, string>>({});
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [periodEdits, setPeriodEdits] = useState<Record<string, { startMonth: string; endMonth: string }>>(
    {}
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [categoryPlanInputs, setCategoryPlanInputs] = useState<Record<string, string>>({});
  const [categoryPlanAppliedId, setCategoryPlanAppliedId] = useState<string | null>(null);

  if (
    !bonusPeriods ||
    !bonusBudgetSettings ||
    !transactions ||
    !fundingSources ||
    !subcategories ||
    !majorCategories ||
    !bonusCategoryPlans
  ) {
    return <p className="muted">読み込み中...</p>;
  }

  const year = new Date().getFullYear();

  async function applyBudget(period: BonusPeriod, periodStart: Date) {
    const raw = budgetInputs[period.id];
    const amount = Number(raw);
    if (!raw || !Number.isFinite(amount)) return;
    await db.bonusBudgetSettings.add({
      id: crypto.randomUUID(),
      bonusPeriodID: period.id,
      amount,
      effectiveFrom: periodStart.toISOString(),
    });
    setBudgetInputs((prev) => ({ ...prev, [period.id]: "" }));
    setAppliedId(period.id);
    setTimeout(() => setAppliedId(null), 2000);
  }

  async function updatePeriodRange(period: BonusPeriod) {
    const edit = periodEdits[period.id];
    if (!edit) return;
    const startMonth = Number(edit.startMonth);
    const endMonth = Number(edit.endMonth);
    if (!Number.isInteger(startMonth) || !Number.isInteger(endMonth)) return;
    if (startMonth < 1 || startMonth > 12 || endMonth < 1 || endMonth > 12) return;
    if (startMonth > endMonth) return;
    await db.bonusPeriods.update(period.id, { startMonth, endMonth });
  }

  async function applyCategoryPlan(period: BonusPeriod, majorCategoryID: string) {
    const raw = categoryPlanInputs[majorCategoryID];
    const amount = Number(raw);
    if (!raw || !Number.isFinite(amount)) return;
    const existing = bonusCategoryPlans!.find(
      (p) => p.bonusPeriodID === period.id && p.year === year && p.majorCategoryID === majorCategoryID
    );
    if (existing) {
      await db.bonusCategoryPlans.update(existing.id, { plannedAmount: amount });
    } else {
      await db.bonusCategoryPlans.add({
        id: crypto.randomUUID(),
        bonusPeriodID: period.id,
        year,
        majorCategoryID,
        plannedAmount: amount,
      });
    }
    setCategoryPlanInputs((prev) => ({ ...prev, [majorCategoryID]: "" }));
    setCategoryPlanAppliedId(majorCategoryID);
    setTimeout(() => setCategoryPlanAppliedId(null), 2000);
  }

  return (
    <div>
      <Link to="/" className="back-link">
        ‹ ホームへ戻る
      </Link>
      <h1 className="screen-title">ボーナス払い予実</h1>

      <div className="list">
        {bonusPeriods.map((period) => {
          const { start, end } = bonusPeriodRange(period, year);
          const budget = bonusBudgetAmount(period.id, start, bonusBudgetSettings);
          const actual = bonusActualAmount(start, end, transactions);
          const over = budget !== undefined && actual > budget;
          const rate = budget ? Math.min(actual / budget, 1) : 0;
          const expanded = expandedId === period.id;
          const edit = periodEdits[period.id] ?? {
            startMonth: String(period.startMonth),
            endMonth: String(period.endMonth),
          };

          const items = transactions
            .filter(
              (t) =>
                t.type === "expense" &&
                t.isBonusPayment &&
                new Date(t.date) >= start &&
                new Date(t.date) < end
            )
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          return (
            <div key={period.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>
                  {period.label}({year}年)
                </strong>
                <span className={over ? "amount over-budget" : "amount"}>{formatYen(actual)}</span>
              </div>
              {budget !== undefined ? (
                <>
                  <div className={`progress ${over ? "over" : ""}`}>
                    <div style={{ width: `${rate * 100}%` }} />
                  </div>
                  <span className="muted">
                    予算 {formatYen(budget)} / 残り {formatYen(budget - actual)}
                  </span>
                </>
              ) : (
                <span className="muted">予算未設定</span>
              )}

              <div className="button-row" style={{ marginTop: 8 }}>
                <input
                  type="number"
                  value={budgetInputs[period.id] ?? ""}
                  onChange={(e) =>
                    setBudgetInputs((prev) => ({ ...prev, [period.id]: e.target.value }))
                  }
                  placeholder="この期間の予算額"
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => applyBudget(period, start)}
                >
                  反映
                </button>
              </div>
              {appliedId === period.id && <p className="muted">予算を反映しました</p>}

              <button
                type="button"
                className="btn-secondary"
                style={{ marginTop: 8 }}
                onClick={() => setExpandedId(expanded ? null : period.id)}
              >
                {expanded ? "閉じる" : "期間設定・案件一覧"}
              </button>

              {expanded && (
                <div style={{ marginTop: 12 }}>
                  <div className="form-row">
                    <label>集計対象月(開始月〜終了月)</label>
                    <div className="button-row">
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={edit.startMonth}
                        onChange={(e) =>
                          setPeriodEdits((prev) => ({
                            ...prev,
                            [period.id]: { ...edit, startMonth: e.target.value },
                          }))
                        }
                      />
                      <span>〜</span>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={edit.endMonth}
                        onChange={(e) =>
                          setPeriodEdits((prev) => ({
                            ...prev,
                            [period.id]: { ...edit, endMonth: e.target.value },
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => updatePeriodRange(period)}
                      >
                        更新
                      </button>
                    </div>
                  </div>

                  <div className="section-title">この期間のボーナス払い案件</div>
                  <div className="list">
                    {items.map((tx) => (
                      <TransactionRow
                        key={tx.id}
                        transaction={tx}
                        fundingSources={fundingSources}
                        subcategories={subcategories}
                        majorCategories={majorCategories}
                      />
                    ))}
                  </div>
                  {items.length === 0 && (
                    <p className="muted">この期間のボーナス払い案件はまだありません</p>
                  )}

                  <div className="section-title" style={{ marginTop: 16 }}>
                    カテゴリ別使用計画
                  </div>
                  <div className="list">
                    {majorCategories.map((major) => {
                      const planned = bonusCategoryPlanAmount(period.id, year, major.id, bonusCategoryPlans);
                      const catActual = bonusCategoryActualAmount(
                        major.id,
                        start,
                        end,
                        transactions,
                        subcategories
                      );
                      const catOver = planned !== undefined && catActual > planned;
                      const catRate = planned ? Math.min(catActual / planned, 1) : 0;

                      return (
                        <div key={major.id} className="card">
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span>{major.name}</span>
                            <span className={catOver ? "amount over-budget" : "amount"}>
                              {formatYen(catActual)}
                            </span>
                          </div>
                          {planned !== undefined ? (
                            <>
                              <div className={`progress ${catOver ? "over" : ""}`}>
                                <div style={{ width: `${catRate * 100}%` }} />
                              </div>
                              <span className="muted">
                                計画 {formatYen(planned)} / 残り {formatYen(planned - catActual)}
                              </span>
                            </>
                          ) : (
                            <span className="muted">計画未設定</span>
                          )}
                          <div className="button-row" style={{ marginTop: 8 }}>
                            <input
                              type="number"
                              value={categoryPlanInputs[major.id] ?? ""}
                              onChange={(e) =>
                                setCategoryPlanInputs((prev) => ({ ...prev, [major.id]: e.target.value }))
                              }
                              placeholder="この用途の計画額"
                            />
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => applyCategoryPlan(period, major.id)}
                            >
                              反映
                            </button>
                          </div>
                          {categoryPlanAppliedId === major.id && (
                            <p className="muted">計画を反映しました</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
