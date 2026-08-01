import type {
  CategoryBudgetSetting,
  MajorCategory,
  MonthlySummary,
  Subcategory,
  Transaction,
} from "../types/models";
import { actualAmount, budgetAmount } from "./budgetCalculator";
import { formatRemaining, formatYearMonth, formatYen } from "./dateUtils";
import type { MonthEndProjection } from "./projectionCalculator";

/**
 * 対予算・対収入の状況、カテゴリ別予算実績、月末着地予想をテキストにまとめる
 * (共有ボタンから配偶者等にサマリーを送る用)。
 */
export function buildBudgetShareText(
  month: Date,
  summary: MonthlySummary,
  majorCategories: MajorCategory[],
  budgetSettings: CategoryBudgetSetting[],
  transactions: Transaction[],
  subcategories: Subcategory[],
  projection: MonthEndProjection | null
): string {
  const lines: string[] = [`【${formatYearMonth(month)} 家計簿サマリー】`, ""];

  lines.push(
    summary.budgetUsageRate !== undefined
      ? `対予算: ${formatYen(summary.totalExpense)} / ${formatYen(summary.totalBudget)}(${Math.round(summary.budgetUsageRate * 100)}%)`
      : "対予算: 予算未設定"
  );
  lines.push(
    summary.incomeUsageRate !== undefined
      ? `対収入: ${formatYen(summary.totalExpense)} / ${formatYen(summary.totalIncome)}(${Math.round(summary.incomeUsageRate * 100)}%)`
      : "対収入: 収入データなし"
  );

  const categoryLines = majorCategories
    .map((major) => ({
      name: major.name,
      budget: budgetAmount(major.id, month, budgetSettings),
      actual: actualAmount(major.id, month, transactions, subcategories),
    }))
    .filter((c) => c.budget !== undefined || c.actual > 0);

  if (categoryLines.length > 0) {
    lines.push("", "■ カテゴリ別");
    for (const c of categoryLines) {
      lines.push(
        c.budget !== undefined
          ? `${c.name}: ${formatYen(c.actual)} / ${formatYen(c.budget)}(${formatRemaining(c.budget - c.actual)})`
          : `${c.name}: ${formatYen(c.actual)}(予算未設定)`
      );
    }
  }

  if (projection) {
    lines.push(
      "",
      `■ 月末着地予想: ${formatYen(projection.totalProjected)}`,
      `(毎月定常 ${formatYen(projection.recurringProjected)} / 該当月定常 ${formatYen(projection.specificProjected)} / 比例費用 ${formatYen(projection.proportionalProjected)})`
    );
  }

  return lines.join("\n");
}
