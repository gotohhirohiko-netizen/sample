import type { MajorCategory, MerchantCategoryMapping, Subcategory } from "../types/models";

/**
 * 店名の全角/半角表記ゆれを吸収する。同じ取引でも、Claude APIによる解析では
 * 全角/半角が正規化された表記になり、コード側の決定的パーサーはPDF/CSVの
 * 原文(半角カナや全角英数字が混在する)をそのまま使うため、同一店名でも
 * 見た目上の文字コードが一致しないことがある。NFKC正規化で半角カナは
 * 全角に、全角英数字は半角に統一される。
 */
function normalizeWidth(s: string): string {
  return s.normalize("NFKC");
}

/**
 * 店名の類似判定キーを抽出する。「ETCカード売上 ○○インター」のように
 * 半角/全角スペースの後に可変の文字列が続く店名は、スペースより手前の
 * 部分だけを同一店名とみなして判定する(要件定義書 4.9)。
 */
export function merchantMatchKey(merchant: string): string {
  const normalized = normalizeWidth(merchant);
  const spaceIndex = normalized.search(/[ 　]/);
  return spaceIndex === -1 ? normalized : normalized.slice(0, spaceIndex);
}

/**
 * 重複判定専用の緩い店名一致判定。クレジットカード明細やPDFはClaudeによる
 * AI解析を経るため、同じ取引を再度取り込んでも摘要文字列がスペース区切り
 * 以外の位置で微妙に変わることがある(余分な語句が付く・表記が変わる等)。
 * merchantMatchKey(スペース以前の完全一致)では検知漏れが起きるため、
 * 空白を除去した上で短い方が長い方の前方一致(4文字以上)であれば
 * 同一店名とみなす。カテゴリ学習等の用途にはmerchantMatchKeyを使うこと。
 */
export function isLikelySameMerchant(a: string, b: string): boolean {
  const normalize = (s: string) => normalizeWidth(s).replace(/[\s　]/g, "");
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  return shorter.length >= 4 && longer.startsWith(shorter);
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
