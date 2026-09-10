import type { RecurringOverride, SpecificMonthPlan, Transaction } from "../types/models";
import { merchantMatchKey } from "./categoryResolver";
import { daysInMonth, isSameMonth, monthToParam } from "./dateUtils";
import { resolveRecurringType } from "./recurringResolver";

/** 毎月定常費用の店名ごとの内訳。thisMonthActualが0の場合はまだ実績が計上されていない(先月実績を予想として採用) */
export interface RecurringMerchantProjection {
  merchant: string;
  thisMonthActual: number;
  lastMonthActual: number;
  /** この店名の予想額(今月・先月の実績の大きい方) */
  projected: number;
  /** 今月すでに実績が計上されているか */
  posted: boolean;
  /**
   * 発生日(今月の日付、"YYYY-MM-DD")。実績計上済みならその実績の日付、
   * 未計上なら先月の発生日から推定した今月の想定日(過去の履歴が無い場合はnull)
   */
  expectedDate: string | null;
  /** expectedDateが実績由来(true)か、先月の履歴からの推定(false)かを示す */
  dateIsActual: boolean;
}

/** 該当月定常費用の店名ごとの内訳。posted=trueは実績額、falseは計画額(SpecificMonthPlan)をそのまま採用 */
export interface SpecificMerchantProjection {
  merchant: string;
  amount: number;
  posted: boolean;
}

export interface MonthEndProjection {
  /** 毎月定常費用(電気代等)の予想額合計。店名ごとに今月/先月実績の大きい方を採用して合算する */
  recurringProjected: number;
  recurringBreakdown: RecurringMerchantProjection[];
  /** 該当月定常費用(美容院・お米等)の今月分合計。実績があれば実績額、無ければ計画額(SpecificMonthPlan) */
  specificProjected: number;
  specificBreakdown: SpecificMerchantProjection[];
  /** 比例費用(食費等、突発扱い)の、日割り計算に用いた実績(前回取り込み日の前日分まで) */
  proportionalActual: number;
  /** proportionalActualの内訳となる取引一覧(日付降順) */
  proportionalTransactions: Transaction[];
  /** 比例費用を月末まで延伸した予想額 */
  proportionalProjected: number;
  /** 定常予想 + 比例予想 + 該当月定常予想の合計予想額 */
  totalProjected: number;
}

/** 取り込んだ全取引の中から最後にインポートした日時を求める(データがなければnull) */
export function lastImportDate(transactions: Transaction[]): Date | null {
  let latest: Date | null = null;
  for (const t of transactions) {
    const imported = new Date(t.importedAt);
    if (!latest || imported.getTime() > latest.getTime()) latest = imported;
  }
  return latest;
}

/**
 * 表示・予想計算に用いる「実質的な前回取り込み日時」。新規取引が0件の
 * 取り込みは取引データに痕跡が残らないため、取引から求めた日時と、
 * 確定ボタンが押されるたびに更新される日時(lastImportConfirmedAt設定)の
 * 遅い方を採用する。
 */
export function effectiveLastImportDate(
  transactions: Transaction[],
  lastImportConfirmedAt: Date | null
): Date | null {
  const derived = lastImportDate(transactions);
  if (!derived) return lastImportConfirmedAt;
  if (!lastImportConfirmedAt) return derived;
  return lastImportConfirmedAt.getTime() > derived.getTime() ? lastImportConfirmedAt : derived;
}

/**
 * 今月の対予算・対収入の月末着地予想額を計算する(要件: 対予算・対収入のグラフに
 * 定常的な支出と比例的な支出を分けて色違いの目安線で示す)。
 *
 * ・毎月定常の支出(取引詳細画面で店名ごとに手動設定。lib/recurringResolver.ts)は
 *   日数に比例して増えるものではないため、店名ごとに先月の実績を目安とする
 *   (今月すでに先月を上回っていれば、より確からしい今月の実績を採用する。
 *   今月まだ実績が計上されていない店名は先月実績がそのまま予想額になる=未計上)
 * ・該当月定常の支出(取引詳細画面で店名ごとに設定。SpecificMonthPlanで
 *   対象月・金額を管理)は、今月すでに実績があればその実績額を、無ければ
 *   今月分の計画額をそのまま採用する(実績が発生済みの月は計画額と二重計上
 *   しないよう自動的に除外される)
 * ・それ以外(比例的な支出)は、前回取り込み日の前日分までの実績を日割りで
 *   月末まで延伸する。「今日(または前回取り込み日)」当日はまだ取り込みが
 *   完了していない可能性があるため、実績の集計・日割り計算のいずれからも
 *   除外する(月末当日に実行しても、月末着地予想が実績と同額になって
 *   しまわないようにするため)
 *
 * 今月以外の月ではnullを返す(月末予想が意味を持たないため)。
 */
export function monthEndExpenseProjection(
  month: Date,
  transactions: Transaction[],
  recurringOverrides: RecurringOverride[],
  specificMonthPlans: SpecificMonthPlan[] = [],
  lastImportConfirmedAt: Date | null = null
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
    return resolveRecurringType(t.merchant, recurringOverrides);
  }

  function displayNameForKey(key: string): string {
    const match = transactions
      .filter((t) => merchantMatchKey(t.merchant) === key)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    return match?.merchant ?? key;
  }

  const monthlyThisMonth = transactions.filter(
    (t) => isRelevantExpense(t, month) && typeOf(t) === "monthly"
  );
  const monthlyLastMonth = transactions.filter(
    (t) => isRelevantExpense(t, lastMonth) && typeOf(t) === "monthly"
  );
  const monthlyKeys = new Set([
    ...monthlyThisMonth.map((t) => merchantMatchKey(t.merchant)),
    ...monthlyLastMonth.map((t) => merchantMatchKey(t.merchant)),
  ]);

  const totalDaysInMonth = daysInMonth(month);

  const recurringBreakdown: RecurringMerchantProjection[] = Array.from(monthlyKeys)
    .map((key) => {
      const thisMonthTx = monthlyThisMonth.filter((t) => merchantMatchKey(t.merchant) === key);
      const lastMonthTx = monthlyLastMonth.filter((t) => merchantMatchKey(t.merchant) === key);
      const thisMonthActual = thisMonthTx.reduce((sum, t) => sum + t.amount, 0);
      const lastMonthActual = lastMonthTx.reduce((sum, t) => sum + t.amount, 0);
      const posted = thisMonthActual > 0;

      let expectedDate: string | null = null;
      let dateIsActual = false;
      if (posted) {
        // 通常は月1回のみのはずだが、複数計上されていた場合は最新日を採用する
        const latest = [...thisMonthTx].sort((a, b) => b.date.localeCompare(a.date))[0];
        expectedDate = latest.date.slice(0, 10);
        dateIsActual = true;
      } else if (lastMonthTx.length > 0) {
        // 過去の履歴(先月の発生日)から、今月の想定発生日を推定する
        const latestLastMonth = [...lastMonthTx].sort((a, b) => b.date.localeCompare(a.date))[0];
        const day = Math.min(new Date(latestLastMonth.date).getDate(), totalDaysInMonth);
        expectedDate = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        dateIsActual = false;
      }

      return {
        merchant: displayNameForKey(key),
        thisMonthActual,
        lastMonthActual,
        projected: Math.max(thisMonthActual, lastMonthActual),
        posted,
        expectedDate,
        dateIsActual,
      };
    })
    .sort((a, b) => {
      if (a.expectedDate && b.expectedDate) return a.expectedDate.localeCompare(b.expectedDate);
      if (a.expectedDate) return -1;
      if (b.expectedDate) return 1;
      return b.projected - a.projected;
    });

  const recurringProjected = recurringBreakdown.reduce((sum, r) => sum + r.projected, 0);

  const totalDays = totalDaysInMonth;
  const importDate = effectiveLastImportDate(transactions, lastImportConfirmedAt);
  const referenceDate =
    importDate && isSameMonth(importDate, month) && importDate.getTime() <= today.getTime()
      ? importDate
      : today;
  const referenceDay = Math.min(referenceDate.getDate(), totalDays);
  // 参照日(前回取り込み日、無ければ今日)の当日分は取り込みが完了していない
  // 可能性があるため、実績・日割り計算のいずれからも除外し、前日分までを使う
  const daysElapsed = Math.max(1, referenceDay - 1);

  const proportionalTransactions = transactions
    .filter(
      (t) =>
        isRelevantExpense(t, month) &&
        typeOf(t) === "spontaneous" &&
        new Date(t.date).getDate() <= daysElapsed
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const proportionalActual = proportionalTransactions.reduce((sum, t) => sum + t.amount, 0);
  const proportionalProjected = (proportionalActual / daysElapsed) * totalDays;

  const specificActualThisMonth = transactions.filter(
    (t) => isRelevantExpense(t, month) && typeOf(t) === "specific"
  );
  const specificActualByKey = new Map<string, number>();
  for (const t of specificActualThisMonth) {
    const key = merchantMatchKey(t.merchant);
    specificActualByKey.set(key, (specificActualByKey.get(key) ?? 0) + t.amount);
  }

  const monthParam = monthToParam(month);
  const specificPlansThisMonth = specificMonthPlans.filter(
    (p) => p.month === monthParam && !specificActualByKey.has(p.merchantKey)
  );

  const specificBreakdown: SpecificMerchantProjection[] = [
    ...Array.from(specificActualByKey.entries()).map(([key, amount]) => ({
      merchant: displayNameForKey(key),
      amount,
      posted: true,
    })),
    ...specificPlansThisMonth.map((p) => ({
      merchant: displayNameForKey(p.merchantKey),
      amount: p.amount,
      posted: false,
    })),
  ].sort((a, b) => b.amount - a.amount);

  const specificProjected = specificBreakdown.reduce((sum, v) => sum + v.amount, 0);

  return {
    recurringProjected,
    recurringBreakdown,
    specificProjected,
    specificBreakdown,
    proportionalActual,
    proportionalTransactions,
    proportionalProjected,
    totalProjected: recurringProjected + proportionalProjected + specificProjected,
  };
}
