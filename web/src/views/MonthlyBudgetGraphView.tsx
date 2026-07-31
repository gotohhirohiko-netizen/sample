import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { actualAmount, budgetAmount, subcategoryActualAmount } from "../lib/budgetCalculator";
import { formatYen, monthToParam, parseMonthParam } from "../lib/dateUtils";
import MonthPicker from "../components/MonthPicker";

/**
 * 月次予実の詳細カテゴリ(小カテゴリ)別グラフ表示(金額の高い順に棒グラフで並べる)。
 * 予算は大カテゴリ単位でしか設定していないため、超過判定は小カテゴリが属する
 * 大カテゴリの実績・予算で行う(同じ大カテゴリの小カテゴリは全て同じ判定になる)。
 */
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

  const bars = subcategories
    .map((sub) => {
      const major = majorCategories.find((m) => m.id === sub.majorCategoryID);
      const actual = subcategoryActualAmount(sub.id, month, transactions);
      const majorActual = major ? actualAmount(major.id, month, transactions, subcategories) : 0;
      const majorBudget = major ? budgetAmount(major.id, month, budgetSettings) : undefined;
      return {
        sub,
        major,
        actual,
        over: majorBudget !== undefined && majorActual > majorBudget,
      };
    })
    .filter((b) => b.major && b.actual > 0)
    .sort((a, b) => b.actual - a.actual);

  const maxValue = Math.max(1, ...bars.map((b) => b.actual));

  return (
    <div>
      <Link to={`/budget/${monthParam}`} className="back-link">
        ‹ 月次予実へ戻る
      </Link>
      <h1 className="screen-title">月次予実グラフ</h1>
      <MonthPicker month={month} onChange={handleMonthChange} />
      <p className="muted">
        詳細カテゴリ(小カテゴリ)ごとの実績を表示しています。赤色は、そのカテゴリが属する大カテゴリの予算を
        超えていることを示します。
      </p>

      {bars.length > 0 ? (
        <div className="bar-chart">
          {bars.map((b) => (
            <button
              key={b.sub.id}
              type="button"
              className="bar-chart-column"
              onClick={() => navigate(`/budget/${monthParam}/${b.major!.id}/${b.sub.id}`)}
            >
              <span className="bar-chart-value">{formatYen(b.actual)}</span>
              <div className="bar-chart-track">
                <div
                  className={`bar-chart-bar ${b.over ? "over" : ""}`}
                  style={{ height: `${(b.actual / maxValue) * 100}%` }}
                />
              </div>
              <span className="bar-chart-label">{b.sub.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">この月の支出はまだありません</p>
      )}
    </div>
  );
}
