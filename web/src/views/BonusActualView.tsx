import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import {
  bonusActualAmount,
  bonusCategoryActualAmount,
  bonusCategoryPlanTotal,
  bonusPeriodRange,
  bonusSubcategoryActualAmount,
} from "../lib/bonusCalculator";
import { formatYen } from "../lib/dateUtils";

/** ボーナス予実画面。計画しているカテゴリごとに、計画額に対する実績額を表示する */
export default function BonusActualView() {
  const { periodId, year: yearParam } = useParams<{ periodId: string; year: string }>();
  const navigate = useNavigate();
  const year = Number(yearParam);

  const bonusPeriods = useLiveQuery(() => db.bonusPeriods.orderBy("displayOrder").toArray(), []);
  const bonusCategoryPlans = useLiveQuery(() => db.bonusCategoryPlans.toArray(), []);
  const majorCategories = useLiveQuery(
    () => db.majorCategories.orderBy("displayOrder").toArray(),
    []
  );
  const subcategories = useLiveQuery(() => db.subcategories.toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);

  if (!bonusPeriods || !bonusCategoryPlans || !majorCategories || !subcategories || !transactions) {
    return <p className="muted">読み込み中...</p>;
  }

  const period = bonusPeriods.find((p) => p.id === periodId);
  if (!period) {
    return (
      <div>
        <p className="muted">ボーナス計画が見つかりません。</p>
        <Link to="/" className="back-link">
          ‹ ホームへ戻る
        </Link>
      </div>
    );
  }

  const { start, end } = bonusPeriodRange(period, year);
  const plans = bonusCategoryPlans.filter((p) => p.bonusPeriodID === period.id && p.year === year);
  const totalPlanned = bonusCategoryPlanTotal(period.id, year, bonusCategoryPlans);
  const totalActual = bonusActualAmount(start, end, transactions);
  const totalOver = totalPlanned > 0 && totalActual > totalPlanned;
  const totalRate = totalPlanned > 0 ? Math.min(totalActual / totalPlanned, 1) : 0;

  return (
    <div>
      <Link to="/" className="back-link">
        ‹ ホームへ戻る
      </Link>
      <h1 className="screen-title">ボーナス予実</h1>

      <div className="month-picker">
        <button
          type="button"
          aria-label="前年"
          onClick={() => navigate(`/bonus-actual/${period.id}/${year - 1}`, { replace: true })}
        >
          ‹
        </button>
        <strong>
          {period.label}({year}年)
        </strong>
        <button
          type="button"
          aria-label="翌年"
          onClick={() => navigate(`/bonus-actual/${period.id}/${year + 1}`, { replace: true })}
        >
          ›
        </button>
      </div>

      <div className="section card">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <strong>トータル</strong>
          <span className={totalOver ? "amount over-budget" : "amount"}>{formatYen(totalActual)}</span>
        </div>
        {totalPlanned > 0 ? (
          <>
            <div className={`progress ${totalOver ? "over" : ""}`}>
              <div style={{ width: `${totalRate * 100}%` }} />
            </div>
            <span className="muted">
              計画 {formatYen(totalPlanned)} / 残り {formatYen(totalPlanned - totalActual)}
            </span>
          </>
        ) : (
          <span className="muted">使用計画未設定</span>
        )}
      </div>

      <div className="list">
        {plans.map((plan) => {
          const major = majorCategories.find((m) => m.id === plan.majorCategoryID);
          const sub = plan.subcategoryID
            ? subcategories.find((s) => s.id === plan.subcategoryID)
            : undefined;
          const planLabel = sub ? `${major?.name ?? "不明"} / ${sub.name}` : major?.name ?? "不明";
          const actual = plan.subcategoryID
            ? bonusSubcategoryActualAmount(plan.subcategoryID, start, end, transactions)
            : bonusCategoryActualAmount(plan.majorCategoryID, start, end, transactions, subcategories);
          const over = actual > plan.plannedAmount;
          const rate = plan.plannedAmount > 0 ? Math.min(actual / plan.plannedAmount, 1) : 0;

          return (
            <button
              key={plan.id}
              type="button"
              className="list-row"
              style={{ flexDirection: "column", alignItems: "stretch" }}
              onClick={() => navigate(`/bonus-actual/${period.id}/${year}/${plan.id}`)}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{planLabel}</span>
                <span className={over ? "amount over-budget" : "amount"}>{formatYen(actual)}</span>
              </div>
              <div className={`progress ${over ? "over" : ""}`}>
                <div style={{ width: `${rate * 100}%` }} />
              </div>
              <span className="muted">
                計画 {formatYen(plan.plannedAmount)} / 残り {formatYen(plan.plannedAmount - actual)}
              </span>
            </button>
          );
        })}
      </div>
      {plans.length === 0 && <p className="muted">この年の使用計画はまだありません</p>}
    </div>
  );
}
