// データモデル(docs/design.md 2章)を実装したもの。
// IDはDexie(IndexedDB)の主キーとして文字列(UUID)を使う。

/** 収入・支出の区分(要件定義書 4.2) */
export type TransactionType = "income" | "expense";

/** 取り込み元の種別(要件定義書 3章・4.8) */
export type FundingSourceKind = "bankAccount" | "creditCard";

/**
 * 大カテゴリ(自由入力ではなく、あらかじめ定義された一覧から選択する。要件定義書 4.3/4.6)
 * 予算(CategoryBudgetSetting)はこの大カテゴリ単位で設定する。
 */
export interface MajorCategory {
  id: string;
  name: string; // 例: "食費"
  displayOrder: number;
}

/** 小カテゴリ(大カテゴリに紐づく。初期データは docs/requirements.md 8章を参照) */
export interface Subcategory {
  id: string;
  majorCategoryID: string;
  name: string; // 例: "食料品"、"カフェ"
  displayOrder: number;
}

/**
 * カテゴリ(大カテゴリ)ごとの月次予算設定。
 * 変更のたびに新しいレコードを追加し(上書きしない)、effectiveFromが
 * 属する月以降にのみ適用される。過去月の予実評価には遡って影響しない
 * (要件定義書 4.6)。
 */
export interface CategoryBudgetSetting {
  id: string;
  majorCategoryID: string;
  monthlyAmount: number;
  effectiveFrom: string; // ISO日付文字列(月初)
}

/**
 * 店名 → カテゴリ の学習マッピング(要件定義書 4.9)。
 * ユーザーが手動でカテゴリを修正するとmerchantKeyをキーにupsertされる。
 */
export interface MerchantCategoryMapping {
  id: string;
  merchantKey: string; // 店名の類似判定キー(lib/categoryResolver#merchantMatchKeyでスペース手前を抽出)
  subcategoryID: string;
  updatedAt: string; // ISO日時文字列
}

/** 取引データ */
export interface Transaction {
  id: string;
  date: string; // ISO日付文字列
  merchant: string; // 店名・利用先(収入の場合は振込元等の摘要)
  amount: number; // 支出は基本プラス。カード返金等の例外時はマイナス。収入は常にプラス
  type: TransactionType;
  subcategoryID: string | null; // 支出のみ設定対象。未設定は「未分類」(収入では使用しない)
  sourceInstitutionID: string; // どの取り込み元から来たか
  memo: string | null;
  importedAt: string; // ISO日時文字列(重複検知の補助情報)
  excludedFromBudget: boolean; // trueの場合、予算実績・月次サマリーの集計に含めない
}

/**
 * 家計に含めない店名の学習(要件定義書 4.9と同様の仕組み)。
 * ユーザーが取引を「家計に含めない」に設定すると、この店名を持つ
 * 取引は以降の取り込みでも自動的に除外対象になる。
 */
export interface MerchantExclusion {
  id: string;
  merchantKey: string; // 店名の類似判定キー(lib/categoryResolver#merchantMatchKey)
  updatedAt: string; // ISO日時文字列
}

/** 取り込み元(金融機関・カード)の設定 */
export interface FundingSource {
  id: string;
  displayName: string; // 例: "三菱UFJ 普通口座(給与用)"
  kind: FundingSourceKind;
  statementDeepLinkURL: string; // 明細ページへの直リンク
}

/** 月次サマリー(対予算・対収入。docs/design.md 3.3) */
export interface MonthlySummary {
  totalExpense: number;
  totalIncome: number;
  totalBudget: number;
  budgetUsageRate: number | undefined; // 支出 ÷ 予算合計
  incomeUsageRate: number | undefined; // 支出 ÷ 収入合計
  savings: number; // 収入 - 支出
}
