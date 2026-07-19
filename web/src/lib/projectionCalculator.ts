import type { RecurringOverride, Transaction } from "../types/models";
import { daysInMonth, isSameMonth } from "./dateUtils";
import { resolveRecurring } from "./recurringResolver";

export interface MonthEndProjection {
  /** 定常費用(電気代等)の予想額。今月の実績と先月の実績の大きい方を採用する */
  recurringProjected: number;
  /** 定常予想 + 比例費用(食費等)を今月ここまでのペースで月末まで延伸した合計予想額 */
  totalProjected: number;
}

/**
 * 今月の対予算・対収入の月末着地予想額を計算する(要件: 対予算・対収入のグラフに
 * 定常的な支出と比例的な支出を分けて色違いの目安線で示す)。
 *
 * ・定常的な支出(店名の学習based定常判定。lib/recurringResolver.ts)は
 *   日数に比例して増えるものではないため、先月の実績を目安とする
 *   (今月すでに先月を上回っていれば、より確からしい今月の実績を採用する)
 * ・それ以外(比例的な支出)は今月ここまでの実績を日割りで月末まで延伸する
 *
 * 今月以外の月ではnullを返す(月末予想が意味を持たないため)。
 */
export function monthEndExpenseProjection(
  month: Date,
  transactions: Transaction[],
  recurringOverrides: RecurringOverride[]
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

  function isRecurring(t: Transaction): boolean {
    return resolveRecurring(t.merchant, transactions, recurringOverrides);
  }

  const recurringThisMonthActual = transactions
    .filter((t) => isRelevantExpense(t, month) && isRecurring(t))
    .reduce((sum, t) => sum + t.amount, 0);

  const recurringLastMonthActual = transactions
    .filter((t) => isRelevantExpense(t, lastMonth) && isRecurring(t))
    .reduce((sum, t) => sum + t.amount, 0);

  const proportionalThisMonthActual = transactions
    .filter((t) => isRelevantExpense(t, month) && !isRecurring(t))
    .reduce((sum, t) => sum + t.amount, 0);

  const daysElapsed = today.getDate();
  const totalDays = daysInMonth(month);
  const proportionalProjected = (proportionalThisMonthActual / daysElapsed) * totalDays;

  const recurringProjected = Math.max(recurringThisMonthActual, recurringLastMonthActual);

  return {
    recurringProjected,
    totalProjected: recurringProjected + proportionalProjected,
  };
}
