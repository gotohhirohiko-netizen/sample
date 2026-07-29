import type { RecurringOverride, RecurringType, Transaction } from "../types/models";
import { merchantMatchKey } from "./categoryResolver";

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

/** 定常(monthly/specificのいずれか)かどうか */
export function resolveRecurring(merchant: string, overrides: RecurringOverride[]): boolean {
  return resolveRecurringType(merchant, overrides) !== "spontaneous";
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
