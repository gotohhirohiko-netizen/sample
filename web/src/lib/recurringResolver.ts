import type { RecurringOverride, Transaction } from "../types/models";
import { merchantMatchKey } from "./categoryResolver";

/**
 * 履歴から「定常費用(毎月発生)」かどうかを自動判定する。
 * 同じ店名(類似判定)の支出が、連続する2つの月の両方に存在すれば定常とみなす
 * (例: お米や美容院のように毎月ではなく数ヶ月おきに発生するものを、
 * 単に2回以上出現しただけで誤って毎月定常と判定しないため)。
 * 初回発生時、または発生月が連続していない場合は単発(突発)扱いになる。
 */
export function isRecurringByHistory(merchant: string, transactions: Transaction[]): boolean {
  const key = merchantMatchKey(merchant);
  const monthKeys = transactions
    .filter((t) => t.type === "expense" && merchantMatchKey(t.merchant) === key)
    .map((t) => {
      const d = new Date(t.date);
      return d.getFullYear() * 12 + d.getMonth(); // 通し月数(比較・連続判定用)
    });
  const months = Array.from(new Set(monthKeys)).sort((a, b) => a - b);
  return months.some((m, i) => i > 0 && m - months[i - 1] === 1);
}

/**
 * 定常/突発の判定。手動オーバーライドがあればそれを優先し、無ければ履歴から自動判定する
 * (要件: 突発か定常かはそれまでの履歴で自動判別、手動でも修正できる)。
 */
export function resolveRecurring(
  merchant: string,
  transactions: Transaction[],
  overrides: RecurringOverride[]
): boolean {
  const key = merchantMatchKey(merchant);
  const override = overrides.find((o) => o.merchantKey === key);
  if (override) return override.isRecurring;
  return isRecurringByHistory(merchant, transactions);
}
