import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { actualAmount, budgetAmount } from "../lib/budgetCalculator";
import { formatYearMonth, formatYen, parseMonthParam, startOfMonth } from "../lib/dateUtils";

/** 月次収支確認機能(カテゴリ別 予算・実績)(要件定義書 4.5) */
export default function MonthlyBudgetView() {
  const { month: monthParam } = useParams();
  const month = parseMonthParam(monthParam);
  const [budgetInputs, setBudgetInputs] = useState<Record<string, string>>({});
  const [appliedId, setAppliedId] = useState<string | null>(null);

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

  async function applyBudget(majorCategoryID: string) {
    const raw = budgetInputs[majorCategoryID];
    const amount = Number(raw);
    if (!raw || !Number.isFinite(amount)) return;
    await db.categoryBudgetSettings.add({
      id: crypto.randomUUID(),
      majorCategoryID,
      monthlyAmount: amount,
      effectiveFrom: startOfMonth(new Date()).toISOString(),
    });
    setBudgetInputs((prev) => ({ ...prev, [majorCategoryID]: "" }));
    setAppliedId(majorCategoryID);
    setTimeout(() => setAppliedId(null), 2000);
  }

  return (
    <div>
      <Link to="/" className="back-link">
        ‹ ホームへ戻る
      </Link>
      <h1 className="screen-title">{formatYearMonth(month)} 予実</h1>

      <div className="list">
        {majorCategories.map((major) => {
          const budget = budgetAmount(major.id, month, budgetSettings);
          const actual = actualAmount(major.id, month, transactions, subcategories);
          const over = budget !== undefined && actual > budget;
          const rate = budget ? Math.min(actual / budget, 1) : 0;

          return (
            <div key={major.id}>
              <Link
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
                    </div>
                    <span className="muted">
                      予算 {formatYen(budget)} / 残り {formatYen(budget - actual)}
                    </span>
                  </>
                ) : (
                  <span className="muted">予算未設定</span>
                )}
              </Link>
              <div className="button-row" style={{ marginTop: -4 }}>
                <input
                  type="number"
                  value={budgetInputs[major.id] ?? ""}
                  onChange={(e) =>
                    setBudgetInputs((prev) => ({ ...prev, [major.id]: e.target.value }))
                  }
                  placeholder="今月以降の予算額"
                />
                <button type="button" className="btn-secondary" onClick={() => applyBudget(major.id)}>
                  反映
                </button>
              </div>
              {appliedId === major.id && <p className="muted">予算を反映しました</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
