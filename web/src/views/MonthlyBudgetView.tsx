import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { actualAmount, budgetAmount, expectedPaceRatio } from "../lib/budgetCalculator";
import { formatYen, monthToParam, parseMonthParam } from "../lib/dateUtils";
import MonthPicker from "../components/MonthPicker";

/** 月次収支確認機能(カテゴリ別 予算・実績)(要件定義書 4.5) */
export default function MonthlyBudgetView() {
  const { month: monthParam } = useParams();
  const month = parseMonthParam(monthParam);
  const navigate = useNavigate();

  function handleMonthChange(newMonth: Date) {
    navigate(`/budget/${monthToParam(newMonth)}`, { replace: true });
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

  const paceRatio = expectedPaceRatio(month);

  return (
    <div>
      <Link to="/" className="back-link">
        ‹ ホームへ戻る
      </Link>
      <h1 className="screen-title">月次予実</h1>
      <MonthPicker month={month} onChange={handleMonthChange} />

      <div className="list">
        {majorCategories.map((major) => {
          const budget = budgetAmount(major.id, month, budgetSettings);
          const actual = actualAmount(major.id, month, transactions, subcategories);
          const over = budget !== undefined && actual > budget;
          const rate = budget ? Math.min(actual / budget, 1) : 0;

          return (
            <Link
              key={major.id}
              to={`/budget/${monthParam}/${major.id}`}
              className="list-row"
              style={{ flexDirection: "column", alignItems: "stretch" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{major.name}</span>
                <span className={over ? "amount over-budget" : "amount"}>{formatYen(actual)}</span>
              </div>
              {budget !== undefined ? (
                <>
                  <div className={`progress ${over ? "over" : ""}`}>
                    <div style={{ width: `${rate * 100}%` }} />
                    {paceRatio !== null && (
                      <div
                        className="progress-pace-marker"
                        style={{ left: `${Math.min(paceRatio, 1) * 100}%` }}
                      />
                    )}
                  </div>
                  <span className="muted">
                    予算 {formatYen(budget)} / 残り {formatYen(budget - actual)}
                  </span>
                </>
              ) : (
                <span className="muted">予算未設定</span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
