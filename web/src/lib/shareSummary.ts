import type {
  CategoryBudgetSetting,
  MajorCategory,
  MonthlySummary,
  RecurringOverride,
  Subcategory,
  Transaction,
} from "../types/models";
import { actualAmount, budgetAmount } from "./budgetCalculator";
import { merchantMatchKey } from "./categoryResolver";
import { formatRemaining, formatYearMonth, formatYen, isSameMonth } from "./dateUtils";
import type { MonthEndProjection } from "./projectionCalculator";
import { resolveRecurringType } from "./recurringResolver";

/** 超過理由レポートで「少額」として除外する金額の下限(この額未満は除外) */
const OVERAGE_SMALL_AMOUNT_THRESHOLD = 3000;
/** 超過理由レポートで1カテゴリあたりに列挙する店名・項目の最大件数 */
const OVERAGE_TOP_ITEMS_PER_CATEGORY = 3;

interface OverageItem {
  merchant: string;
  amount: number;
}

/**
 * 予算超過している大カテゴリについて、その超過の主な要因(店名・項目単位の
 * 内訳)を求める。毎月定常(電気代等、固定費として認識済みのもの)は
 * 「原因」として報告する意味が薄いため除外し、金額の小さいものも除外する。
 * 同じ店名の取引は合算し、金額の大きい順に上位のみ返す。
 */
function overageBreakdown(
  majorCategoryID: string,
  month: Date,
  transactions: Transaction[],
  subcategories: Subcategory[],
  recurringOverrides: RecurringOverride[]
): OverageItem[] {
  const subcategoryIDs = new Set(
    subcategories.filter((s) => s.majorCategoryID === majorCategoryID).map((s) => s.id)
  );
  const relevant = transactions.filter(
    (t) =>
      t.type === "expense" &&
      !t.excludedFromBudget &&
      !t.isBonusPayment &&
      t.subcategoryID != null &&
      subcategoryIDs.has(t.subcategoryID) &&
      isSameMonth(new Date(t.date), month) &&
      resolveRecurringType(t.merchant, recurringOverrides) !== "monthly"
  );

  const byMerchant = new Map<string, OverageItem & { latestDate: string }>();
  for (const t of relevant) {
    const key = merchantMatchKey(t.merchant);
    const existing = byMerchant.get(key);
    if (existing) {
      existing.amount += t.amount;
      if (t.date > existing.latestDate) {
        existing.merchant = t.merchant;
        existing.latestDate = t.date;
      }
    } else {
      byMerchant.set(key, { merchant: t.merchant, amount: t.amount, latestDate: t.date });
    }
  }

  return Array.from(byMerchant.values())
    .filter((v) => v.amount >= OVERAGE_SMALL_AMOUNT_THRESHOLD)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, OVERAGE_TOP_ITEMS_PER_CATEGORY)
    .map(({ merchant, amount }) => ({ merchant, amount }));
}

/**
 * 対予算・対収入の状況、カテゴリ別予算実績、超過理由、月末着地予想をテキストに
 * まとめる(共有ボタンから配偶者等にサマリーを送る用)。
 */
export function buildBudgetShareText(
  month: Date,
  summary: MonthlySummary,
  majorCategories: MajorCategory[],
  budgetSettings: CategoryBudgetSetting[],
  transactions: Transaction[],
  subcategories: Subcategory[],
  projection: MonthEndProjection | null,
  recurringOverrides: RecurringOverride[]
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
      id: major.id,
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

  const overCategories = categoryLines.filter((c) => c.budget !== undefined && c.actual > c.budget);
  if (overCategories.length > 0) {
    const overageLines: string[] = [];
    for (const c of overCategories) {
      const breakdown = overageBreakdown(c.id, month, transactions, subcategories, recurringOverrides);
      if (breakdown.length === 0) continue;
      overageLines.push(`${c.name}:`);
      for (const item of breakdown) {
        overageLines.push(`  ${item.merchant} ${formatYen(item.amount)}`);
      }
    }
    if (overageLines.length > 0) {
      lines.push(
        "",
        "■ 超過の主な要因(毎月定常・少額を除く上位)",
        ...overageLines
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
