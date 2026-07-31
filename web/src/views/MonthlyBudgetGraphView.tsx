import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { actualAmount, budgetAmount } from "../lib/budgetCalculator";
import { formatYen, monthToParam, parseMonthParam } from "../lib/dateUtils";
import MonthPicker from "../components/MonthPicker";

/** 月次予実のカテゴリ別グラフ表示(金額の高い順に棒グラフで並べる) */
export default function MonthlyBudgetGraphView() {
  const { month: monthParam } = useParams();
  const month = parseMonthParam(monthParam);
  const navigate = useNavigate();

  function handleMonthChange(newMonth: Date) {
    navigate(`/budget/${monthToParam(newMonth)}/graph`, { replace: true });
  }

  const majorCategories = useLiveQuery(
    () => db.majorCategories.orderBy("displayOrder").toArray(),
    []
  );
  const subcategories = useLiveQuery(() => db.subcategories.toArray(), []);
  const budgetSettings = useLiveQuery(() => db.categoryBudgetSettings.toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);

  if (!majorCategories || !subcategories || !budgetSettings || !transactions) {
    return <p className="muted">読み込み中...</p>;
  }

  const bars = majorCategories
    .map((major) => {
      const actual = actualAmount(major.id, month, transactions, subcategories);
      const budget = budgetAmount(major.id, month, budgetSettings);
      return {
        major,
        actual,
        budget,
        over: budget !== undefined && actual > budget,
      };
    })
    .filter((b) => b.actual > 0)
    .sort((a, b) => b.actual - a.actual);

  const maxValue = Math.max(1, ...bars.map((b) => b.actual));

  return (
    <div>
      <Link to={`/budget/${monthParam}`} className="back-link">
        ‹ 月次予実へ戻る
      </Link>
      <h1 className="screen-title">月次予実グラフ</h1>
      <MonthPicker month={month} onChange={handleMonthChange} />

      {bars.length > 0 ? (
        <div className="bar-chart">
          {bars.map((b) => (
            <button
              key={b.major.id}
              type="button"
              className="bar-chart-column"
              onClick={() => navigate(`/budget/${monthParam}/${b.major.id}`)}
            >
              <span className="bar-chart-value">{formatYen(b.actual)}</span>
              <div className="bar-chart-track">
                <div
                  className={`bar-chart-bar ${b.over ? "over" : ""}`}
                  style={{ height: `${(b.actual / maxValue) * 100}%` }}
                />
              </div>
              <span className="bar-chart-label">{b.major.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">この月の支出はまだありません</p>
      )}
    </div>
  );
}
