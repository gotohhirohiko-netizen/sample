import type { Transaction } from "../types/models";
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
