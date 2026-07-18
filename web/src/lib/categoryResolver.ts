import type { MajorCategory, MerchantCategoryMapping, Subcategory } from "../types/models";

/**
 * 店名の類似判定キーを抽出する。「ETCカード売上 ○○インター」のように
 * 半角/全角スペースの後に可変の文字列が続く店名は、スペースより手前の
 * 部分だけを同一店名とみなして判定する(要件定義書 4.9)。
 */
export function merchantMatchKey(merchant: string): string {
  const spaceIndex = merchant.search(/[ 　]/);
  return spaceIndex === -1 ? merchant : merchant.slice(0, spaceIndex);
}

/**
 * カテゴリ自動判定ロジック(要件定義書 4.9 / docs/design.md 4.4)。
 * 優先順位: ①学習マッピング(店名の類似判定) → ②Claudeによる推定 → ③未分類(null)
 */
export function resolveCategory(
  merchant: string,
  claudeSuggestedMajor: string | null,
  claudeSuggestedSub: string | null,
  mappings: MerchantCategoryMapping[],
  subcategories: Subcategory[],
  majorCategories: MajorCategory[]
): string | null {
  const key = merchantMatchKey(merchant);
  const learned = mappings.find((m) => merchantMatchKey(m.merchantKey) === key);
  if (learned) return learned.subcategoryID;

  if (claudeSuggestedMajor && claudeSuggestedSub) {
    const major = majorCategories.find((m) => m.name === claudeSuggestedMajor);
    if (major) {
      const sub = subcategories.find(
        (s) => s.majorCategoryID === major.id && s.name === claudeSuggestedSub
      );
      if (sub) return sub.id;
    }
  }

  return null;
}
