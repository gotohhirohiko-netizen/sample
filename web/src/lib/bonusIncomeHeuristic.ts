import type { BonusIncomeSchedule, Transaction } from "../types/models";
import { merchantMatchKey } from "./categoryResolver";

/**
 * ボーナス収入(賞与)は振込名称に「賞与」等の目印が無く、給与と同じ振込元
 * (店名/摘要)であることが多いため店名では判別できない。代わりに、同じ
 * 振込元からの過去の収入額と比べて明らかに大きい(中央値の1.5倍超)場合に
 * 「ボーナスの可能性がある」と提案する目安。あくまで確認用の初期値であり、
 * ユーザーが取り込みプレビュー・取引詳細でいつでも手動修正できる。
 */
export function suggestBonusIncome(
  merchant: string,
  amount: number,
  existingTransactions: Transaction[]
): boolean {
  const key = merchantMatchKey(merchant);
  const pastAmounts = existingTransactions
    .filter((t) => t.type === "income" && merchantMatchKey(t.merchant) === key && !t.isBonusIncome)
    .map((t) => t.amount)
    .sort((a, b) => a - b);
  if (pastAmounts.length === 0) return false;
  const median = pastAmounts[Math.floor(pastAmounts.length / 2)];
  return median > 0 && amount > median * 1.5;
}

/**
 * 振込日が銀行の非営業日(土日・祝日)にあたる場合、実際の振込はそれより
 * 前の営業日にずれる。祝日を正確に判定するのは(春分・秋分等が年によって
 * 変わるため)難しいので、代わりに「設定した日付以前、数日以内」という
 * 幅を持たせて判定する。土日を跨ぐ程度のずれは十分にカバーできる。
 */
const SCHEDULE_LOOKBACK_DAYS = 5;

/**
 * 振込先の口座・振込日(毎年同じ月日)が分かっている場合の、より確実な
 * ボーナス収入判定。指定口座からの収入で、日付が「設定日からさかのぼって
 * 数日以内」であれば該当するとみなす。
 */
export function matchesBonusIncomeSchedule(
  date: string,
  sourceInstitutionID: string,
  schedules: BonusIncomeSchedule[]
): boolean {
  const txDate = new Date(date);
  return schedules.some((schedule) => {
    if (schedule.fundingSourceID !== sourceInstitutionID) return false;
    const target = new Date(txDate.getFullYear(), schedule.month - 1, schedule.day);
    const diffDays = (target.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= SCHEDULE_LOOKBACK_DAYS;
  });
}
