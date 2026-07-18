import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { monthlySummary } from "../lib/budgetCalculator";
import { formatYen, monthToParam } from "../lib/dateUtils";
import MonthPicker from "../components/MonthPicker";

/** ホーム画面: 対予算・対収入サマリー(要件定義書 4.7) */
export default function HomeView() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => new Date());

  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const budgetSettings = useLiveQuery(() => db.categoryBudgetSettings.toArray(), []);
  const majorCategories = useLiveQuery(
    () => db.majorCategories.orderBy("displayOrder").toArray(),
    []
  );

  if (!transactions || !budgetSettings || !majorCategories) {
    return <p className="muted">読み込み中...</p>;
  }

  const summary = monthlySummary(month, transactions, budgetSettings, majorCategories);
  const monthParam = monthToParam(month);

  return (
    <div>
      <h1 className="screen-title">ホーム</h1>
      <MonthPicker month={month} onChange={setMonth} />

      <div className="section card">
        <div className="section-title">収支サマリー</div>
        <p>支出合計: {formatYen(summary.totalExpense)}</p>
        <p>収入合計: {formatYen(summary.totalIncome)}</p>
        <p>収支差額: {formatYen(summary.savings)}</p>
      </div>

      <div className="section card">
        <div className="section-title">対予算・対収入</div>
        {summary.budgetUsageRate !== undefined ? (
          <>
            <p>対予算 {Math.round(summary.budgetUsageRate * 100)}%</p>
            <div className={`progress ${summary.budgetUsageRate > 1 ? "over" : ""}`}>
              <div style={{ width: `${Math.min(summary.budgetUsageRate * 100, 100)}%` }} />
            </div>
          </>
        ) : (
          <p className="muted">予算未設定</p>
        )}
        {summary.incomeUsageRate !== undefined ? (
          <>
            <p>対収入 {Math.round(summary.incomeUsageRate * 100)}%</p>
            <div className={`progress ${summary.incomeUsageRate > 1 ? "over" : ""}`}>
              <div style={{ width: `${Math.min(summary.incomeUsageRate * 100, 100)}%` }} />
            </div>
          </>
        ) : (
          <p className="muted">収入データなし</p>
        )}
      </div>

      <div className="section list">
        <button type="button" className="list-row" onClick={() => navigate(`/daily/${monthParam}`)}>
          日次収支リスト
        </button>
        <button type="button" className="list-row" onClick={() => navigate(`/budget/${monthParam}`)}>
          月次予実(カテゴリ別)
        </button>
      </div>
    </div>
  );
}
