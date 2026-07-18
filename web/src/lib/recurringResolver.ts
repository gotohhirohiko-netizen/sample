import type { RecurringOverride, Transaction } from "../types/models";
import { merchantMatchKey } from "./categoryResolver";

/**
 * 履歴から「定常費用(毎月発生)」かどうかを自動判定する。
 * 同じ店名(類似判定)の支出が2つ以上の異なる月に存在すれば定常とみなす。
 * 初回発生時は判断材料が無いため単発(突発)扱いになる。
 */
export function isRecurringByHistory(merchant: string, transactions: Transaction[]): boolean {
  const key = merchantMatchKey(merchant);
  const months = new Set(
    transactions
      .filter((t) => t.type === "expense" && merchantMatchKey(t.merchant) === key)
      .map((t) => {
        const d = new Date(t.date);
        return `${d.getFullYear()}-${d.getMonth()}`;
      })
  );
  return months.size >= 2;
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
