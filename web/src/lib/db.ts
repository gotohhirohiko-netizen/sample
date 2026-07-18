import Dexie, { type EntityTable } from "dexie";
import type {
  BonusBudgetSetting,
  BonusPeriod,
  CategoryBudgetSetting,
  FundingSource,
  MajorCategory,
  MerchantCategoryMapping,
  MerchantExclusion,
  RecurringOverride,
  Subcategory,
  Transaction,
} from "../types/models";

/**
 * IndexedDBデータベース(docs/design.md 7章)。
 * Dexieはブラウザ標準のIndexedDBを薄くラップするライブラリで、
 * `dexie-react-hooks`のuseLiveQueryによりSwiftDataの@Query相当の
 * リアクティブな読み取りができる。
 */
/** APIキーや最終バックアップ日時などの単純なキー・バリュー設定 */
export interface KeyValueEntry {
  key: string;
  value: string;
}

export class KakeiboDB extends Dexie {
  transactions!: EntityTable<Transaction, "id">;
  fundingSources!: EntityTable<FundingSource, "id">;
  majorCategories!: EntityTable<MajorCategory, "id">;
  subcategories!: EntityTable<Subcategory, "id">;
  categoryBudgetSettings!: EntityTable<CategoryBudgetSetting, "id">;
  merchantCategoryMappings!: EntityTable<MerchantCategoryMapping, "id">;
  merchantExclusions!: EntityTable<MerchantExclusion, "id">;
  bonusPeriods!: EntityTable<BonusPeriod, "id">;
  bonusBudgetSettings!: EntityTable<BonusBudgetSetting, "id">;
  recurringOverrides!: EntityTable<RecurringOverride, "id">;
  settings!: EntityTable<KeyValueEntry, "key">;

  constructor() {
    super("kakeibo");
    this.version(1).stores({
      transactions: "id, date, type, subcategoryID, sourceInstitutionID",
      fundingSources: "id",
      majorCategories: "id, displayOrder",
      subcategories: "id, majorCategoryID",
      categoryBudgetSettings: "id, majorCategoryID, effectiveFrom",
      merchantCategoryMappings: "id, merchantKey",
      settings: "key",
    });
    this.version(2).stores({
      transactions: "id, date, type, subcategoryID, sourceInstitutionID",
      fundingSources: "id",
      majorCategories: "id, displayOrder",
      subcategories: "id, majorCategoryID",
      categoryBudgetSettings: "id, majorCategoryID, effectiveFrom",
      merchantCategoryMappings: "id, merchantKey",
      merchantExclusions: "id, merchantKey",
      settings: "key",
    });
    this.version(3).stores({
      transactions: "id, date, type, subcategoryID, sourceInstitutionID",
      fundingSources: "id",
      majorCategories: "id, displayOrder",
      subcategories: "id, majorCategoryID",
      categoryBudgetSettings: "id, majorCategoryID, effectiveFrom",
      merchantCategoryMappings: "id, merchantKey",
      merchantExclusions: "id, merchantKey",
      bonusPeriods: "id, displayOrder",
      bonusBudgetSettings: "id, bonusPeriodID, effectiveFrom",
      settings: "key",
    });
    this.version(4).stores({
      transactions: "id, date, type, subcategoryID, sourceInstitutionID",
      fundingSources: "id",
      majorCategories: "id, displayOrder",
      subcategories: "id, majorCategoryID",
      categoryBudgetSettings: "id, majorCategoryID, effectiveFrom",
      merchantCategoryMappings: "id, merchantKey",
      merchantExclusions: "id, merchantKey",
      bonusPeriods: "id, displayOrder",
      bonusBudgetSettings: "id, bonusPeriodID, effectiveFrom",
      recurringOverrides: "id, merchantKey",
      settings: "key",
    });
  }
}

export const db = new KakeiboDB();
