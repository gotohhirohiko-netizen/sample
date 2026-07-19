import type {
  CategoryBudgetSetting,
  MajorCategory,
  MonthlySummary,
  Subcategory,
  Transaction,
} from "../types/models";
import { daysInMonth, isSameMonth, startOfMonth } from "./dateUtils";

/**
 * 指定した大カテゴリ・月に適用される予算額を取得する(docs/design.md 3.1)。
 * 1つのカテゴリに複数の予算計画(期間の異なるもの)を持てるため、対象月が
 * effectiveFrom〜effectiveTo(無指定なら無期限)の範囲に収まる計画の中から、
 * 最もeffectiveFromが新しいものを採用する。過去に確定した月の表示は、
 * 後から予算を変更しても変わらない。
 */
export function budgetAmount(
  majorCategoryID: string,
  month: Date,
  settings: CategoryBudgetSetting[]
): number | undefined {
  const monthStart = startOfMonth(month);
  const applicable = settings
    .filter(
      (s) =>
        s.majorCategoryID === majorCategoryID &&
        new Date(s.effectiveFrom) <= monthStart &&
        (s.effectiveTo == null || monthStart <= new Date(s.effectiveTo))
    )
    .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
  return applicable[0]?.monthlyAmount;
}

/**
 * 大カテゴリの月次実績額(支出)の集計(docs/design.md 3.2)。
 * そのカテゴリに属する全小カテゴリのTransactionを合算して求める。
 * ボーナス払いの案件はボーナス予実(bonusCalculator.ts)側で管理するため除外する。
 */
export function actualAmount(
  majorCategoryID: string,
  month: Date,
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
        !t.excludedFromBudget &&
        !t.isBonusPayment &&
        isSameMonth(new Date(t.date), month)
    )
    .filter((t) => t.subcategoryID != null && subcategoryIDs.has(t.subcategoryID))
    .reduce((sum, t) => sum + t.amount, 0);
}

/**
 * 表示中の月が今月の場合、「今日時点で消化しているべき割合の目安」を返す
 * (例: 30日中20日目なら約2/3)。今月以外の月ではnullを返す(目安が意味を
 * 持たないため)。
 */
export function expectedPaceRatio(month: Date): number | null {
  const today = new Date();
  if (!isSameMonth(month, today)) return null;
  return today.getDate() / daysInMonth(month);
}

/** 月次サマリー(対予算・対収入)の計算(docs/design.md 3.3) */
export function monthlySummary(
  month: Date,
  transactions: Transaction[],
  budgetSettings: CategoryBudgetSetting[],
  majorCategories: MajorCategory[]
): MonthlySummary {
  const monthTx = transactions.filter(
    (t) => !t.excludedFromBudget && !t.isBonusPayment && isSameMonth(new Date(t.date), month)
  );
  const totalExpense = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const totalIncome = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalBudget = majorCategories
    .map((c) => budgetAmount(c.id, month, budgetSettings) ?? 0)
    .reduce((s, v) => s + v, 0);

  return {
    totalExpense,
    totalIncome,
    totalBudget,
    budgetUsageRate: totalBudget > 0 ? totalExpense / totalBudget : undefined,
    incomeUsageRate: totalIncome > 0 ? totalExpense / totalIncome : undefined,
    savings: totalIncome - totalExpense,
  };
}
