import type { RecurringOverride, RecurringOverrideType, RecurringType, Transaction } from "../types/models";
import { merchantMatchKey } from "./categoryResolver";

export const RECURRING_OVERRIDE_TYPE_LABELS: Record<RecurringOverrideType, string> = {
  monthly: "毎月定常",
  specific: "該当月定常",
};

/**
 * 定常費用区分の判定。取引詳細画面で手動設定したオーバーライドのみを見る
 * (出現頻度による自動判定は行わない。日用品や食品店のように毎月何度も
 * 利用する店を誤って定常と判定してしまうため)。オーバーライドの無い店名は
 * 全てspontaneous(比例費用)として扱う。
 */
export function resolveRecurringType(merchant: string, overrides: RecurringOverride[]): RecurringType {
  const key = merchantMatchKey(merchant);
  const override = overrides.find((o) => o.merchantKey === key);
  return override ? override.type : "spontaneous";
}

/**
 * 「毎月定常」に設定可能な店名かどうかを判定する。
 * 2ヶ月以上の履歴があり、かつそのいずれの月も1回のみの発生であることを条件とする
 * (同じ月に複数回発生する店名は、日用品や食品店のように毎月何度も利用する店で
 * あり、金額固定の定常費用ではないため対象外)。
 */
export function isEligibleForMonthlyRecurring(merchant: string, transactions: Transaction[]): boolean {
  const key = merchantMatchKey(merchant);
  const countsByMonth = new Map<number, number>();
  for (const t of transactions) {
    if (t.type !== "expense" || merchantMatchKey(t.merchant) !== key) continue;
    const d = new Date(t.date);
    const monthKey = d.getFullYear() * 12 + d.getMonth();
    countsByMonth.set(monthKey, (countsByMonth.get(monthKey) ?? 0) + 1);
  }
  if (countsByMonth.size < 2) return false;
  return Array.from(countsByMonth.values()).every((count) => count === 1);
}

/**
 * 該当月定常(取引詳細画面でtype="specific"に設定済み)の店名一覧を返す。
 * ホーム画面の「当月の計画・予算調整」で、該当月の計画を追加する際の選択候補として使う。
 */
export function specificTypeMerchantCandidates(
  transactions: Transaction[],
  overrides: RecurringOverride[]
): string[] {
  const latestByKey = new Map<string, { merchant: string; date: string }>();
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    const key = merchantMatchKey(t.merchant);
    const existing = latestByKey.get(key);
    if (!existing || t.date > existing.date) {
      latestByKey.set(key, { merchant: t.merchant, date: t.date });
    }
  }
  return Array.from(latestByKey.values())
    .filter((v) => resolveRecurringType(v.merchant, overrides) === "specific")
    .map((v) => v.merchant)
    .sort((a, b) => a.localeCompare(b, "ja"));
}
