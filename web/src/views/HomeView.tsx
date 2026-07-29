import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { monthlySummary } from "../lib/budgetCalculator";
import { monthEndExpenseProjection } from "../lib/projectionCalculator";
import {
  bonusActualAmount,
  bonusCategoryPlanTotal,
  bonusIncomeActualAmount,
  bonusPeriodRange,
  findBonusPeriodForMonth,
} from "../lib/bonusCalculator";
import { formatYen, monthToParam } from "../lib/dateUtils";
import { loadLastBackupAt } from "../lib/keyStorage";
import MonthPicker from "../components/MonthPicker";

const BACKUP_REMINDER_DAYS = 7;

/** ホーム画面: 対予算・対収入サマリー(要件定義書 4.7) */
export default function HomeView() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => new Date());
  const [lastBackupAt, setLastBackupAt] = useState<Date | null | undefined>(undefined);
  const [plannedFormOpen, setPlannedFormOpen] = useState(false);
  const [plannedLabel, setPlannedLabel] = useState("");
  const [plannedAmount, setPlannedAmount] = useState("");

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
  const plannedExpenses = useLiveQuery(() => db.plannedExpenses.toArray(), []);

  if (
    !transactions ||
    !budgetSettings ||
    !majorCategories ||
    !recurringOverrides ||
    !bonusPeriods ||
    !bonusCategoryPlans ||
    !plannedExpenses
  ) {
    return <p className="muted">読み込み中...</p>;
  }

  const summary = monthlySummary(month, transactions, budgetSettings, majorCategories);
  const monthParam = monthToParam(month);
  const projection = monthEndExpenseProjection(month, transactions, recurringOverrides, plannedExpenses);
  const monthPlannedExpenses = plannedExpenses.filter((p) => p.month === monthParam);

  async function addPlannedExpense() {
    const amount = Number(plannedAmount);
    if (plannedLabel.trim() === "" || !Number.isFinite(amount) || amount <= 0) return;
    await db.plannedExpenses.add({
      id: crypto.randomUUID(),
      month: monthParam,
      label: plannedLabel.trim(),
      plannedAmount: amount,
    });
    setPlannedLabel("");
    setPlannedAmount("");
    setPlannedFormOpen(false);
  }

  async function deletePlannedExpense(id: string) {
    if (!confirm("この計画を削除しますか?")) return;
    await db.plannedExpenses.delete(id);
  }

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
        <div className="section-title">対予算・対収入</div>
        {summary.budgetUsageRate !== undefined ? (
          <>
            <p>対予算 {Math.round(summary.budgetUsageRate * 100)}%</p>
            <div className={`progress ${summary.budgetUsageRate > 1 ? "over" : ""}`}>
              <div style={{ width: `${Math.min(summary.budgetUsageRate * 100, 100)}%` }} />
              {projection && summary.totalBudget > 0 && (
                <>
                  <div
                    className="progress-marker-recurring"
                    style={{
                      left: `${Math.min((projection.recurringProjected / summary.totalBudget) * 100, 100)}%`,
                    }}
                  />
                  <div
                    className="progress-marker-proportional"
                    style={{
                      left: `${Math.min((projection.totalProjected / summary.totalBudget) * 100, 100)}%`,
                    }}
                  />
                </>
              )}
            </div>
            <span className="muted">
              {formatYen(summary.totalExpense)} / 予算 {formatYen(summary.totalBudget)}
            </span>
          </>
        ) : (
          <p className="muted">予算未設定</p>
        )}
        {summary.incomeUsageRate !== undefined ? (
          <>
            <p>対収入 {Math.round(summary.incomeUsageRate * 100)}%</p>
            <div className={`progress ${summary.incomeUsageRate > 1 ? "over" : ""}`}>
              <div style={{ width: `${Math.min(summary.incomeUsageRate * 100, 100)}%` }} />
              {projection && summary.totalIncome > 0 && (
                <>
                  <div
                    className="progress-marker-recurring"
                    style={{
                      left: `${Math.min((projection.recurringProjected / summary.totalIncome) * 100, 100)}%`,
                    }}
                  />
                  <div
                    className="progress-marker-proportional"
                    style={{
                      left: `${Math.min((projection.totalProjected / summary.totalIncome) * 100, 100)}%`,
                    }}
                  />
                </>
              )}
            </div>
            <span className="muted">
              {formatYen(summary.totalExpense)} / 収入 {formatYen(summary.totalIncome)}
            </span>
          </>
        ) : (
          <p className="muted">収入データなし</p>
        )}
        {projection && (
          <p className="muted">
            <span className="legend-recurring">■</span> 定常費用の予想({formatYen(projection.recurringProjected)})
            <span className="legend-proportional">■</span> 月末着地予想({formatYen(projection.totalProjected)})
          </p>
        )}

        {monthPlannedExpenses.length > 0 && (
          <div className="list" style={{ marginTop: 8 }}>
            {monthPlannedExpenses.map((p) => (
              <div key={p.id} className="list-row">
                <span>{p.label}</span>
                <div className="button-row">
                  <span className="muted">{formatYen(p.plannedAmount)}</span>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => deletePlannedExpense(p.id)}
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {plannedFormOpen ? (
          <div className="section" style={{ marginTop: 8 }}>
            <div className="form-row">
              <label>内容</label>
              <input
                value={plannedLabel}
                onChange={(e) => setPlannedLabel(e.target.value)}
                placeholder="例: お米、美容院"
              />
            </div>
            <div className="form-row">
              <label>金額</label>
              <input
                type="number"
                min={0}
                value={plannedAmount}
                onChange={(e) => setPlannedAmount(e.target.value)}
              />
            </div>
            <div className="button-row">
              <button type="button" className="btn-primary" onClick={addPlannedExpense}>
                追加
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setPlannedFormOpen(false);
                  setPlannedLabel("");
                  setPlannedAmount("");
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn-secondary"
            style={{ marginTop: 8 }}
            onClick={() => setPlannedFormOpen(true)}
          >
            当月の計画を追加
          </button>
        )}

        <div className="list" style={{ marginTop: 8 }}>
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
                <div style={{ width: `${Math.min(bonusSummary.budgetUsageRate * 100, 100)}%` }} />
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
                <div style={{ width: `${Math.min(bonusSummary.incomeUsageRate * 100, 100)}%` }} />
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
