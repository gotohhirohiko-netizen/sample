import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import {
  bonusCategoryActualAmount,
  bonusCategoryPlanTotal,
  bonusIncomeActualAmount,
  bonusPeriodRange,
  bonusSubcategoryActualAmount,
} from "../lib/bonusCalculator";
import { formatYen } from "../lib/dateUtils";
import TransactionRow from "../components/TransactionRow";

/** ボーナス払いの予実確認画面(設定・計画の編集は/settings/bonusへ移動) */
export default function BonusBudgetView() {
  const bonusPeriods = useLiveQuery(() => db.bonusPeriods.orderBy("displayOrder").toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const fundingSources = useLiveQuery(() => db.fundingSources.toArray(), []);
  const subcategories = useLiveQuery(() => db.subcategories.toArray(), []);
  const majorCategories = useLiveQuery(() => db.majorCategories.toArray(), []);
  const bonusCategoryPlans = useLiveQuery(() => db.bonusCategoryPlans.toArray(), []);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [yearByPeriod, setYearByPeriod] = useState<Record<string, number>>({});

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

                  <div
                    className="section-title"
                    style={{
                      marginTop: 16,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>カテゴリ別使用計画</span>
                    <Link to="/settings/bonus" className="muted">
                      計画を編集 ›
                    </Link>
                  </div>
                  <div className="list">
                    {bonusCategoryPlans
                      .filter((p) => p.bonusPeriodID === period.id && p.year === year)
                      .map((plan) => {
                        const major = majorCategories.find((m) => m.id === plan.majorCategoryID);
                        const sub = plan.subcategoryID
                          ? subcategories.find((s) => s.id === plan.subcategoryID)
                          : undefined;
                        const label = sub ? `${major?.name ?? "不明"} / ${sub.name}` : major?.name ?? "不明";
                        const catActual = plan.subcategoryID
                          ? bonusSubcategoryActualAmount(plan.subcategoryID, start, end, transactions)
                          : bonusCategoryActualAmount(
                              plan.majorCategoryID,
                              start,
                              end,
                              transactions,
                              subcategories
                            );
                        const catOver = catActual > plan.plannedAmount;
                        const catRate = plan.plannedAmount
                          ? Math.min(catActual / plan.plannedAmount, 1)
                          : 0;

                        return (
                          <div key={plan.id} className="card">
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span>{label}</span>
                              <span className={catOver ? "amount over-budget" : "amount"}>
                                {formatYen(catActual)}
                              </span>
                            </div>
                            <div className={`progress ${catOver ? "over" : ""}`}>
                              <div style={{ width: `${catRate * 100}%` }} />
                            </div>
                            <span className="muted">
                              計画 {formatYen(plan.plannedAmount)} / 残り{" "}
                              {formatYen(plan.plannedAmount - catActual)}
                            </span>
                          </div>
                        );
                      })}
                    {bonusCategoryPlans.filter((p) => p.bonusPeriodID === period.id && p.year === year)
                      .length === 0 && <p className="muted">この期間の使用計画はまだありません</p>}
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
