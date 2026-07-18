import type { BonusBudgetSetting, BonusPeriod, Transaction } from "../types/models";

/**
 * ボーナス払いの集計・予実ロジック。カテゴリ予算(budgetCalculator.ts)と
 * 同じ「非遡及」の考え方をボーナス期間単位で適用する。
 */

/** 指定した年における、その期間の実際の開始日・終了日(終了日は翌月1日=排他的上限)を返す */
export function bonusPeriodRange(period: BonusPeriod, year: number): { start: Date; end: Date } {
  const start = new Date(year, period.startMonth - 1, 1);
  const end = new Date(year, period.endMonth, 1);
  return { start, end };
}

/**
 * 指定した期間・年に適用されるボーナス予算額を取得する。
 * 過去に確定した期間の表示は、後から予算を変更しても変わらない。
 */
export function bonusBudgetAmount(
  bonusPeriodID: string,
  periodStart: Date,
  settings: BonusBudgetSetting[]
): number | undefined {
  const applicable = settings
    .filter((s) => s.bonusPeriodID === bonusPeriodID && new Date(s.effectiveFrom) <= periodStart)
    .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
  return applicable[0]?.amount;
}

/** 指定した期間内のボーナス払い案件(支出)の実績額を集計する */
export function bonusActualAmount(
  start: Date,
  end: Date,
  transactions: Transaction[]
): number {
  return transactions
    .filter(
      (t) =>
        t.type === "expense" &&
        t.isBonusPayment &&
        !t.excludedFromBudget &&
        new Date(t.date) >= start &&
        new Date(t.date) < end
    )
    .reduce((sum, t) => sum + t.amount, 0);
}
