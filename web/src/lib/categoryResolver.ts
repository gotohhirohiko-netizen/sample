import type { MajorCategory, MerchantCategoryMapping, Subcategory } from "../types/models";

/**
 * カテゴリ自動判定ロジック(要件定義書 4.9 / docs/design.md 4.4)。
 * 優先順位: ①学習マッピング(店名の完全一致) → ②Claudeによる推定 → ③未分類(null)
 */
export function resolveCategory(
  merchant: string,
  claudeSuggestedMajor: string | null,
  claudeSuggestedSub: string | null,
  mappings: MerchantCategoryMapping[],
  subcategories: Subcategory[],
  majorCategories: MajorCategory[]
): string | null {
  const learned = mappings.find((m) => m.merchantKey === merchant);
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
