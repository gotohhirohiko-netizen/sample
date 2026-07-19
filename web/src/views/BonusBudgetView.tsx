import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import {
  bonusCategoryActualAmount,
  bonusCategoryPlanAmount,
  bonusCategoryPlanTotal,
  bonusIncomeActualAmount,
  bonusPeriodRange,
} from "../lib/bonusCalculator";
import { formatYen } from "../lib/dateUtils";
import TransactionRow from "../components/TransactionRow";
import type { BonusPeriod } from "../types/models";

/** ボーナス払いの予実確認画面(設定は/settings/bonusへ移動) */
export default function BonusBudgetView() {
  const bonusPeriods = useLiveQuery(() => db.bonusPeriods.orderBy("displayOrder").toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const fundingSources = useLiveQuery(() => db.fundingSources.toArray(), []);
  const subcategories = useLiveQuery(() => db.subcategories.toArray(), []);
  const majorCategories = useLiveQuery(() => db.majorCategories.toArray(), []);
  const bonusCategoryPlans = useLiveQuery(() => db.bonusCategoryPlans.toArray(), []);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [yearByPeriod, setYearByPeriod] = useState<Record<string, number>>({});
  const [categoryPlanInputs, setCategoryPlanInputs] = useState<Record<string, string>>({});
  const [categoryPlanAppliedId, setCategoryPlanAppliedId] = useState<string | null>(null);

  if (
    !bonusPeriods ||
    !transactions ||
    !fundingSources ||
    !subcategories ||
    !majorCategories ||
    !bonusCategoryPlans
  ) {
    return <p className="muted">読み込み中...</p>;
  }

  const currentYear = new Date().getFullYear();

  function yearFor(periodId: string): number {
    return yearByPeriod[periodId] ?? currentYear;
  }

  function changeYear(periodId: string, delta: number) {
    setYearByPeriod((prev) => ({ ...prev, [periodId]: yearFor(periodId) + delta }));
  }

  async function applyCategoryPlan(period: BonusPeriod, year: number, majorCategoryID: string) {
    const inputKey = `${period.id}-${year}-${majorCategoryID}`;
    const raw = categoryPlanInputs[inputKey];
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
    setCategoryPlanInputs((prev) => ({ ...prev, [inputKey]: "" }));
    setCategoryPlanAppliedId(inputKey);
    setTimeout(() => setCategoryPlanAppliedId(null), 2000);
  }

  return (
    <div>
      <Link to="/" className="back-link">
        ‹ ホームへ戻る
      </Link>
      <h1 className="screen-title">ボーナス払い予実</h1>
      <Link to="/settings/bonus" className="back-link">
        ボーナス設定へ ›
      </Link>

      <div className="list">
        {bonusPeriods.map((period) => {
          const year = yearFor(period.id);
          const { start, end } = bonusPeriodRange(period, year);
          const income = bonusIncomeActualAmount(start, end, transactions);
          const allocated = bonusCategoryPlanTotal(period.id, year, bonusCategoryPlans);
          const remaining = income - allocated;
          const overAllocated = allocated > income;
          const allocationRate = income ? Math.min(allocated / income, 1) : 0;
          const expanded = expandedId === period.id;

          const items = transactions
            .filter(
              (t) =>
                t.type === "expense" &&
                t.isBonusPayment &&
                new Date(t.date) >= start &&
                new Date(t.date) < end
            )
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          const incomeItems = transactions
            .filter(
              (t) =>
                t.type === "income" &&
                t.isBonusIncome &&
                new Date(t.date) >= start &&
                new Date(t.date) < end
            )
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          return (
            <div key={period.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="month-picker" style={{ margin: 0 }}>
                  <button
                    type="button"
                    aria-label="前年"
                    onClick={() => changeYear(period.id, -1)}
                  >
                    ‹
                  </button>
                  <strong>
                    {period.label}({year}年)
                  </strong>
                  <button
                    type="button"
                    aria-label="翌年"
                    onClick={() => changeYear(period.id, 1)}
                  >
                    ›
                  </button>
                </div>
                <span className="amount">収入 {formatYen(income)}</span>
              </div>

              <div className={`progress ${overAllocated ? "over" : ""}`}>
                <div style={{ width: `${allocationRate * 100}%` }} />
              </div>
              <span className="muted">
                割り当て済み {formatYen(allocated)} / 残金 {formatYen(remaining)}
              </span>

              <button
                type="button"
                className="btn-secondary"
                style={{ marginTop: 8 }}
                onClick={() => setExpandedId(expanded ? null : period.id)}
              >
                {expanded ? "閉じる" : "収入・案件・使用計画を見る"}
              </button>

              {expanded && (
                <div style={{ marginTop: 12 }}>
                  <div className="section-title">この期間のボーナス収入</div>
                  <div className="list">
                    {incomeItems.map((tx) => (
                      <TransactionRow
                        key={tx.id}
                        transaction={tx}
                        fundingSources={fundingSources}
                        subcategories={subcategories}
                        majorCategories={majorCategories}
                      />
                    ))}
                  </div>
                  {incomeItems.length === 0 && (
                    <p className="muted">この期間のボーナス収入はまだありません</p>
                  )}

                  <div className="section-title" style={{ marginTop: 16 }}>
                    この期間のボーナス払い案件
                  </div>
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
                      const inputKey = `${period.id}-${year}-${major.id}`;

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
                              value={categoryPlanInputs[inputKey] ?? ""}
                              onChange={(e) =>
                                setCategoryPlanInputs((prev) => ({ ...prev, [inputKey]: e.target.value }))
                              }
                              placeholder="この用途の計画額"
                            />
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => applyCategoryPlan(period, year, major.id)}
                            >
                              反映
                            </button>
                          </div>
                          {categoryPlanAppliedId === inputKey && (
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
