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
 * 1つのカテゴリに複数の予算計画を持てる(例: 4月〜9月は多め、10月〜は通常額)。
 * 上書きはせず追加のみで管理し、effectiveFrom〜effectiveTo(未指定なら無期限)の
 * 範囲に属する月にのみ適用される。過去月の予実評価には遡って影響しない
 * (要件定義書 4.6)。
 */
export interface CategoryBudgetSetting {
  id: string;
  majorCategoryID: string;
  monthlyAmount: number;
  effectiveFrom: string; // ISO日付文字列(月初)。この月から適用開始
  effectiveTo: string | null; // ISO日付文字列(月初)。この月まで適用(null=無期限)
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

/**
 * 店名ごとに「カテゴリが一意に決まらない(都度変わる)」ことを示すフラグ
 * (例: Yahoo!ショッピングのように何を買うかで支出カテゴリが変わる店)。
 * 立っている店名は、学習マッピングによるカテゴリ自動反映・複数取引への
 * 一括反映の対象外とする。ユーザーが手動で設定するほか、同じ店名で異なる
 * 小カテゴリが設定された履歴を検知した時点で自動的に立てる。
 */
export interface MerchantAmbiguousFlag {
  id: string;
  merchantKey: string; // 店名の類似判定キー(lib/categoryResolver#merchantMatchKey)
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
  isBonusPayment: boolean; // ボーナス払い(クレジットカード)の案件かどうか
  isBonusIncome: boolean; // ボーナス収入(賞与等)かどうか。trueの場合、月次サマリーの収入集計から除外する
}

/**
 * ボーナス払いの集計期間の定義(例: 1-6月、7-12月)。
 * 年をまたいで毎年繰り返される期間として扱う(年ごとの実際の日付範囲は
 * lib/bonusCalculator#bonusPeriodRangeで計算する)。
 */
export interface BonusPeriod {
  id: string;
  label: string; // 例: "1-6月"
  startMonth: number; // 1-12
  endMonth: number; // 1-12(startMonth <= endMonthを想定)
  displayOrder: number;
}

/**
 * ボーナス収入の振込スケジュール(要件: 振込先口座・振込日が決まっている
 * 場合はそれで判定する)。日付は毎年同じ月日として扱い、実際の振込が
 * 銀行の非営業日回避で前倒しになる可能性を考慮して判定する
 * (lib/bonusIncomeHeuristic.ts#matchesBonusIncomeSchedule参照)。
 */
export interface BonusIncomeSchedule {
  id: string;
  fundingSourceID: string;
  month: number; // 1-12
  day: number; // 1-31
}

/**
 * ボーナス期間・年ごとの、カテゴリ別の使用計画(要件: ボーナスの使用用途を
 * 消費カテゴリと同じ項目で計画できるようにする)。期間は毎年繰り返される
 * ため、年ごとに独立した計画として管理する(前の期の計画が翌年に
 * 引き継がれて混乱しないように)。
 */
export interface BonusCategoryPlan {
  id: string;
  bonusPeriodID: string;
  year: number;
  majorCategoryID: string;
  subcategoryID: string | null; // null=大カテゴリ全体への計画。指定時はその小カテゴリのみへの計画
  plannedAmount: number;
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

/**
 * 店名ごとの「定常費用/突発費用」の手動判定オーバーライド。
 * 未設定の店名は履歴から自動判定する(lib/recurringResolver.ts参照)。
 * ユーザーが手動で修正するとmerchantKeyをキーにupsertされる。
 */
export interface RecurringOverride {
  id: string;
  merchantKey: string; // 店名の類似判定キー(lib/categoryResolver#merchantMatchKey)
  isRecurring: boolean;
  updatedAt: string; // ISO日時文字列
}

/** 取り込み元(金融機関・カード)の設定 */
export interface FundingSource {
  id: string;
  displayName: string; // 例: "三菱UFJ 普通口座(給与用)"
  kind: FundingSourceKind;
  statementDeepLinkURL: string; // 明細ページへの直リンク
  importShortcutName?: string; // ダウンロード済みファイルをクリップボードにコピーするiOSショートカットの名前(shortcuts://run-shortcutで起動)
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

/**
 * Claude API(明細解析)の呼び出し1回分の使用量記録。
 * 実際の請求はAnthropic Consoleが正なので、これはアプリ内での目安表示用。
 */
export interface ApiUsageLog {
  id: string;
  createdAt: string; // ISO日時文字列
  sourceInstitutionID: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}
