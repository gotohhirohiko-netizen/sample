import type { BonusCategoryPlan, BonusPeriod, Subcategory, Transaction } from "../types/models";

/**
 * ボーナス払いの集計・予実ロジック。ボーナス収入(実績)を原資とし、
 * カテゴリ別使用計画がそこからどれだけ配分されているかを示す
 * 「収入 → 割り当て → 残金」の考え方で管理する。
 */

/** 指定した年における、その期間の実際の開始日・終了日(終了日は翌月1日=排他的上限)を返す */
export function bonusPeriodRange(period: BonusPeriod, year: number): { start: Date; end: Date } {
  const start = new Date(year, period.startMonth - 1, 1);
  const end = new Date(year, period.endMonth, 1);
  return { start, end };
}

/** 指定した月(1-12)が属するボーナス集計期間を返す(例: 7月なら7-12月の期間) */
export function findBonusPeriodForMonth(
  periods: BonusPeriod[],
  monthNumber: number
): BonusPeriod | undefined {
  return periods.find((p) => p.startMonth <= monthNumber && monthNumber <= p.endMonth);
}

/** 指定した期間内のボーナス収入の実績額を集計する */
export function bonusIncomeActualAmount(
  start: Date,
  end: Date,
  transactions: Transaction[]
): number {
  return transactions
    .filter(
      (t) =>
        t.type === "income" &&
        t.isBonusIncome &&
        new Date(t.date) >= start &&
        new Date(t.date) < end
    )
    .reduce((sum, t) => sum + t.amount, 0);
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

/**
 * ボーナスの使用用途計画(要件: 消費カテゴリと同じ項目でボーナスの使い道を
 * 計画できるように)。期間は毎年繰り返されるため年ごとに独立して管理する。
 * 大カテゴリ全体への計画(subcategoryID=null)を対象とする。
 */
export function bonusCategoryPlanAmount(
  bonusPeriodID: string,
  year: number,
  majorCategoryID: string,
  plans: BonusCategoryPlan[]
): number | undefined {
  return plans.find(
    (p) =>
      p.bonusPeriodID === bonusPeriodID &&
      p.year === year &&
      p.majorCategoryID === majorCategoryID &&
      p.subcategoryID == null
  )?.plannedAmount;
}

/** 特定の小カテゴリへの使用計画額を求める */
export function bonusSubcategoryPlanAmount(
  bonusPeriodID: string,
  year: number,
  subcategoryID: string,
  plans: BonusCategoryPlan[]
): number | undefined {
  return plans.find(
    (p) => p.bonusPeriodID === bonusPeriodID && p.year === year && p.subcategoryID === subcategoryID
  )?.plannedAmount;
}

/** 指定した期間・年の使用計画の合計額(割り当て済み額)を求める */
export function bonusCategoryPlanTotal(
  bonusPeriodID: string,
  year: number,
  plans: BonusCategoryPlan[]
): number {
  return plans
    .filter((p) => p.bonusPeriodID === bonusPeriodID && p.year === year)
    .reduce((sum, p) => sum + p.plannedAmount, 0);
}

/** 指定した期間・大カテゴリ(配下の全小カテゴリ)のボーナス払い案件(支出)の実績額を集計する */
export function bonusCategoryActualAmount(
  majorCategoryID: string,
  start: Date,
  end: Date,
  transactions: Transaction[],
  subcategories: Subcategory[]
): number {
  const subcategoryIDs = new Set(
    subcategories.filter((s) => s.majorCategoryID === majorCategoryID).map((s) => s.id)
  );
  return transactions
    .filter(
      (t) =>
        t.type === "expense" &&
        t.isBonusPayment &&
        !t.excludedFromBudget &&
        t.subcategoryID != null &&
        subcategoryIDs.has(t.subcategoryID) &&
        new Date(t.date) >= start &&
        new Date(t.date) < end
    )
    .reduce((sum, t) => sum + t.amount, 0);
}

/** 指定した期間・小カテゴリのボーナス払い案件(支出)の実績額を集計する */
export function bonusSubcategoryActualAmount(
  subcategoryID: string,
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
        t.subcategoryID === subcategoryID &&
        new Date(t.date) >= start &&
        new Date(t.date) < end
    )
    .reduce((sum, t) => sum + t.amount, 0);
}
