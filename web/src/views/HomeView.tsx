import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { monthlySummary } from "../lib/budgetCalculator";
import { lastImportDate, monthEndExpenseProjection } from "../lib/projectionCalculator";
import {
  bonusActualAmount,
  bonusCategoryPlanTotal,
  bonusIncomeActualAmount,
  bonusPeriodRange,
  findBonusPeriodForMonth,
} from "../lib/bonusCalculator";
import { formatYen, monthToParam } from "../lib/dateUtils";
import { loadLastBackupAt } from "../lib/keyStorage";
import BudgetProgressBar from "../components/BudgetProgressBar";
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
  const recurringOverrides = useLiveQuery(() => db.recurringOverrides.toArray(), []);
  const bonusPeriods = useLiveQuery(() => db.bonusPeriods.orderBy("displayOrder").toArray(), []);
  const bonusCategoryPlans = useLiveQuery(() => db.bonusCategoryPlans.toArray(), []);
  const specificMonthPlans = useLiveQuery(() => db.specificMonthPlans.toArray(), []);
  const budgetAdjustments = useLiveQuery(() => db.budgetAdjustments.toArray(), []);

  if (
    !transactions ||
    !budgetSettings ||
    !majorCategories ||
    !recurringOverrides ||
    !bonusPeriods ||
    !bonusCategoryPlans ||
    !specificMonthPlans ||
    !budgetAdjustments
  ) {
    return <p className="muted">読み込み中...</p>;
  }

  const summary = monthlySummary(month, transactions, budgetSettings, majorCategories, budgetAdjustments);
  const monthParam = monthToParam(month);
  const projection = monthEndExpenseProjection(month, transactions, recurringOverrides, specificMonthPlans);
  const importDate = lastImportDate(transactions);

  const currentBonusPeriod = findBonusPeriodForMonth(bonusPeriods, month.getMonth() + 1);
  const bonusSummary = currentBonusPeriod
    ? (() => {
        const { start, end } = bonusPeriodRange(currentBonusPeriod, month.getFullYear());
        const actual = bonusActualAmount(start, end, transactions);
        const income = bonusIncomeActualAmount(start, end, transactions);
        const allocated = bonusCategoryPlanTotal(currentBonusPeriod.id, month.getFullYear(), bonusCategoryPlans);
        return {
          period: currentBonusPeriod,
          actual,
          income,
          allocated,
          budgetUsageRate: allocated > 0 ? actual / allocated : undefined,
          incomeUsageRate: income > 0 ? actual / income : undefined,
        };
      })()
    : null;

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
        <div className="section-title" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>対予算・対収入</span>
          {importDate && (
            <span className="muted">
              前回取り込み {importDate.getMonth() + 1}/{importDate.getDate()}
            </span>
          )}
        </div>
        {summary.budgetUsageRate !== undefined && (
          <p>対予算 {Math.round(summary.budgetUsageRate * 100)}%</p>
        )}
        {summary.incomeUsageRate !== undefined && (
          <p>対収入 {Math.round(summary.incomeUsageRate * 100)}%</p>
        )}
        {summary.budgetUsageRate !== undefined || summary.incomeUsageRate !== undefined ? (
          <>
            <BudgetProgressBar
              actual={summary.totalExpense}
              threshold={summary.totalBudget}
              secondaryThreshold={
                summary.totalIncome > 0 ? { value: summary.totalIncome } : undefined
              }
              markers={
                projection
                  ? [
                      {
                        key: "recurring",
                        value: projection.recurringProjected,
                        className: "progress-marker-recurring",
                      },
                      {
                        key: "total",
                        value: projection.totalProjected,
                        className: "progress-marker-proportional",
                      },
                    ]
                  : []
              }
            />
            <p className="muted threshold-legend">
              <span className="threshold-legend-budget">▲</span>予算
              {summary.totalIncome > 0 && (
                <span className="threshold-legend-income">▲収入</span>
              )}
            </p>
            <span className="muted">
              {formatYen(summary.totalExpense)}
              {summary.totalBudget > 0 && ` / 予算 ${formatYen(summary.totalBudget)}`}
              {summary.budgetAdjustmentTotal !== 0 &&
                ` (調整 ${summary.budgetAdjustmentTotal > 0 ? "+" : ""}${formatYen(summary.budgetAdjustmentTotal)})`}
              {summary.totalIncome > 0 && ` / 収入 ${formatYen(summary.totalIncome)}`}
            </span>
          </>
        ) : (
          <p className="muted">予算・収入データなし</p>
        )}
        {projection && (
          <button
            type="button"
            className="list-row"
            style={{ flexDirection: "column", alignItems: "stretch", marginTop: 8 }}
            onClick={() => navigate(`/projection/${monthParam}`)}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>
                <span className="legend-recurring">■</span>定常費用の予想
              </span>
              <span>{formatYen(projection.recurringProjected)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>
                <span className="legend-proportional">■</span>月末着地予想
              </span>
              <span>{formatYen(projection.totalProjected)}</span>
            </div>
            <span className="muted" style={{ textAlign: "right" }}>
              内訳 ›
            </span>
          </button>
        )}

        <div className="list" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="list-row"
            onClick={() => navigate(`/adjustments/${monthParam}`)}
          >
            <span>当月の計画・予算調整</span>
            <span className="muted">›</span>
          </button>
          <button type="button" className="list-row" onClick={() => navigate(`/daily/${monthParam}`)}>
            <span>日次収支リスト</span>
            <span className="muted">›</span>
          </button>
          <button type="button" className="list-row" onClick={() => navigate(`/budget/${monthParam}`)}>
            <span>月次予実(カテゴリ別)</span>
            <span className="muted">›</span>
          </button>
        </div>
      </div>

      {bonusSummary && (
        <div className="section card">
          <div className="section-title">
            ボーナス対予算・対収入({bonusSummary.period.label})
          </div>
          {bonusSummary.budgetUsageRate !== undefined ? (
            <>
              <p>対予算 {Math.round(bonusSummary.budgetUsageRate * 100)}%</p>
              <div className={`progress ${bonusSummary.budgetUsageRate > 1 ? "over" : ""}`}>
                <div
                  className="progress-fill"
                  style={{ width: `${Math.min(bonusSummary.budgetUsageRate * 100, 100)}%` }}
                />
              </div>
              <span className="muted">
                {formatYen(bonusSummary.actual)} / 割り当て {formatYen(bonusSummary.allocated)}
              </span>
            </>
          ) : (
            <p className="muted">使用計画未設定</p>
          )}
          {bonusSummary.incomeUsageRate !== undefined ? (
            <>
              <p>対収入 {Math.round(bonusSummary.incomeUsageRate * 100)}%</p>
              <div className={`progress ${bonusSummary.incomeUsageRate > 1 ? "over" : ""}`}>
                <div
                  className="progress-fill"
                  style={{ width: `${Math.min(bonusSummary.incomeUsageRate * 100, 100)}%` }}
                />
              </div>
              <span className="muted">
                {formatYen(bonusSummary.actual)} / 収入 {formatYen(bonusSummary.income)}
              </span>
            </>
          ) : (
            <p className="muted">ボーナス収入なし</p>
          )}
          <div className="list" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="list-row"
              onClick={() => navigate(`/bonus-actual/${bonusSummary.period.id}/${month.getFullYear()}`)}
            >
              <span>ボーナス予実</span>
              <span className="muted">›</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
