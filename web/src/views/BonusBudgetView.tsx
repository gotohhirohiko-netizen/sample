import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import {
  bonusCategoryActualAmount,
  bonusPeriodRange,
  bonusSubcategoryActualAmount,
} from "../lib/bonusCalculator";
import { formatYen } from "../lib/dateUtils";

/** ボーナス払いの予実確認画面(設定・計画の編集は/settings/bonusへ、トータルはホーム画面へ) */
export default function BonusBudgetView() {
  const bonusPeriods = useLiveQuery(() => db.bonusPeriods.orderBy("displayOrder").toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const subcategories = useLiveQuery(() => db.subcategories.toArray(), []);
  const majorCategories = useLiveQuery(() => db.majorCategories.toArray(), []);
  const bonusCategoryPlans = useLiveQuery(() => db.bonusCategoryPlans.toArray(), []);

  const [yearByPeriod, setYearByPeriod] = useState<Record<string, number>>({});

  if (!bonusPeriods || !transactions || !subcategories || !majorCategories || !bonusCategoryPlans) {
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
          const plans = bonusCategoryPlans.filter(
            (p) => p.bonusPeriodID === period.id && p.year === year
          );

          return (
            <div key={period.id} className="card">
              <div className="month-picker" style={{ margin: 0 }}>
                <button type="button" aria-label="前年" onClick={() => changeYear(period.id, -1)}>
                  ‹
                </button>
                <strong>
                  {period.label}({year}年)
                </strong>
                <button type="button" aria-label="翌年" onClick={() => changeYear(period.id, 1)}>
                  ›
                </button>
              </div>

              <div
                className="section-title"
                style={{
                  marginTop: 12,
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
                {plans.map((plan) => {
                  const major = majorCategories.find((m) => m.id === plan.majorCategoryID);
                  const sub = plan.subcategoryID
                    ? subcategories.find((s) => s.id === plan.subcategoryID)
                    : undefined;
                  const label = sub ? `${major?.name ?? "不明"} / ${sub.name}` : major?.name ?? "不明";
                  const catActual = plan.subcategoryID
                    ? bonusSubcategoryActualAmount(plan.subcategoryID, start, end, transactions)
                    : bonusCategoryActualAmount(plan.majorCategoryID, start, end, transactions, subcategories);
                  const catOver = catActual > plan.plannedAmount;
                  const catRate = plan.plannedAmount ? Math.min(catActual / plan.plannedAmount, 1) : 0;

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
                        計画 {formatYen(plan.plannedAmount)} / 残り {formatYen(plan.plannedAmount - catActual)}
                      </span>
                    </div>
                  );
                })}
                {plans.length === 0 && <p className="muted">この期間の使用計画はまだありません</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
