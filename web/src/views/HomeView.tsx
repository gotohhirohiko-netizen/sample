import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { monthlySummary } from "../lib/budgetCalculator";
import { formatYen, monthToParam } from "../lib/dateUtils";
import { loadLastBackupAt } from "../lib/keyStorage";
import MonthPicker from "../components/MonthPicker";

const BACKUP_REMINDER_DAYS = 7;

/** ホーム画面: 対予算・対収入サマリー(要件定義書 4.7) */
export default function HomeView() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => new Date());
  const [lastBackupAt, setLastBackupAt] = useState<Date | null | undefined>(undefined);

  useEffect(() => {
    loadLastBackupAt().then(setLastBackupAt);
  }, []);

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

  const daysSinceBackup = lastBackupAt
    ? (Date.now() - lastBackupAt.getTime()) / (1000 * 60 * 60 * 24)
    : null;
  const needsBackupReminder =
    lastBackupAt !== undefined && (lastBackupAt === null || daysSinceBackup! >= BACKUP_REMINDER_DAYS);

  return (
    <div>
      <h1 className="screen-title">ホーム</h1>

      {needsBackupReminder && (
        <div className="section card">
          <p className="muted">
            {lastBackupAt
              ? `最終バックアップから${Math.floor(daysSinceBackup!)}日経過しています`
              : "まだバックアップを取っていません"}
          </p>
          <Link to="/settings/backup">バックアップ/復元へ</Link>
        </div>
      )}

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
        <button type="button" className="list-row" onClick={() => navigate("/bonus-budget")}>
          ボーナス払い予実
        </button>
      </div>
    </div>
  );
}
