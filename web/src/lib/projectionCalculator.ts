import type { RecurringOverride, SpecificMonthPlan, Transaction } from "../types/models";
import { merchantMatchKey } from "./categoryResolver";
import { daysInMonth, isSameMonth, monthToParam } from "./dateUtils";
import { resolveRecurringType } from "./recurringResolver";

export interface MonthEndProjection {
  /** 毎月定常費用(電気代等)の予想額。今月の実績と先月の実績の大きい方を採用する */
  recurringProjected: number;
  /** 該当月定常費用(美容院・お米等)の今月分。実績があれば実績額、無ければ計画額(SpecificMonthPlan) */
  specificProjected: number;
  /** 定常予想 + 比例費用(食費等)を今月ここまでのペースで月末まで延伸 + 該当月定常費用の合計予想額 */
  totalProjected: number;
}

/**
 * 今月の対予算・対収入の月末着地予想額を計算する(要件: 対予算・対収入のグラフに
 * 定常的な支出と比例的な支出を分けて色違いの目安線で示す)。
 *
 * ・毎月定常の支出(店名の学習based定常判定。lib/recurringResolver.ts)は
 *   日数に比例して増えるものではないため、先月の実績を目安とする
 *   (今月すでに先月を上回っていれば、より確からしい今月の実績を採用する)
 * ・該当月定常の支出(取引詳細画面で店名ごとに設定。SpecificMonthPlanで
 *   対象月・金額を管理)は、今月すでに実績があればその実績額を、無ければ
 *   今月分の計画額をそのまま採用する(実績が発生済みの月は計画額と二重計上
 *   しないよう自動的に除外される)
 * ・それ以外(比例的な支出)は今月ここまでの実績を日割りで月末まで延伸する
 *
 * 今月以外の月ではnullを返す(月末予想が意味を持たないため)。
 */
export function monthEndExpenseProjection(
  month: Date,
  transactions: Transaction[],
  recurringOverrides: RecurringOverride[],
  specificMonthPlans: SpecificMonthPlan[] = []
): MonthEndProjection | null {
  const today = new Date();
  if (!isSameMonth(month, today)) return null;

  const lastMonth = new Date(month.getFullYear(), month.getMonth() - 1, 1);

  function isRelevantExpense(t: Transaction, target: Date): boolean {
    return (
      t.type === "expense" &&
      !t.excludedFromBudget &&
      !t.isBonusPayment &&
      isSameMonth(new Date(t.date), target)
    );
  }

  function typeOf(t: Transaction) {
    return resolveRecurringType(t.merchant, transactions, recurringOverrides);
  }

  const recurringThisMonthActual = transactions
    .filter((t) => isRelevantExpense(t, month) && typeOf(t) === "monthly")
    .reduce((sum, t) => sum + t.amount, 0);

  const recurringLastMonthActual = transactions
    .filter((t) => isRelevantExpense(t, lastMonth) && typeOf(t) === "monthly")
    .reduce((sum, t) => sum + t.amount, 0);

  const recurringProjected = Math.max(recurringThisMonthActual, recurringLastMonthActual);

  const proportionalThisMonthActual = transactions
    .filter((t) => isRelevantExpense(t, month) && typeOf(t) === "spontaneous")
    .reduce((sum, t) => sum + t.amount, 0);

  const daysElapsed = today.getDate();
  const totalDays = daysInMonth(month);
  const proportionalProjected = (proportionalThisMonthActual / daysElapsed) * totalDays;

  const specificActualThisMonth = transactions.filter(
    (t) => isRelevantExpense(t, month) && typeOf(t) === "specific"
  );
  const specificActualMerchantKeys = new Set(
    specificActualThisMonth.map((t) => merchantMatchKey(t.merchant))
  );
  const specificActualTotal = specificActualThisMonth.reduce((sum, t) => sum + t.amount, 0);

  const monthParam = monthToParam(month);
  const specificPlannedTotal = specificMonthPlans
    .filter((p) => p.month === monthParam && !specificActualMerchantKeys.has(p.merchantKey))
    .reduce((sum, p) => sum + p.amount, 0);

  const specificProjected = specificActualTotal + specificPlannedTotal;

  return {
    recurringProjected,
    specificProjected,
    totalProjected: recurringProjected + proportionalProjected + specificProjected,
  };
}
