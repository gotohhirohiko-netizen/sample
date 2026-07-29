import Dexie, { type EntityTable } from "dexie";
import type {
  BonusCategoryPlan,
  BonusIncomeSchedule,
  BonusPeriod,
  BudgetAdjustment,
  CategoryBudgetSetting,
  FundingSource,
  MajorCategory,
  MerchantAmbiguousFlag,
  MerchantCategoryMapping,
  MerchantExclusion,
  RecurringOverride,
  SpecificMonthPlan,
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
  merchantAmbiguousFlags!: EntityTable<MerchantAmbiguousFlag, "id">;
  bonusPeriods!: EntityTable<BonusPeriod, "id">;
  recurringOverrides!: EntityTable<RecurringOverride, "id">;
  bonusCategoryPlans!: EntityTable<BonusCategoryPlan, "id">;
  bonusIncomeSchedules!: EntityTable<BonusIncomeSchedule, "id">;
  budgetAdjustments!: EntityTable<BudgetAdjustment, "id">;
  specificMonthPlans!: EntityTable<SpecificMonthPlan, "id">;
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
    this.version(5).stores({
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
      bonusCategoryPlans: "id, bonusPeriodID, year, majorCategoryID",
      settings: "key",
    });
    this.version(6).stores({
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
      bonusCategoryPlans: "id, bonusPeriodID, year, majorCategoryID",
      bonusIncomeSchedules: "id, fundingSourceID",
      settings: "key",
    });
    this.version(7).stores({
      transactions: "id, date, type, subcategoryID, sourceInstitutionID",
      fundingSources: "id",
      majorCategories: "id, displayOrder",
      subcategories: "id, majorCategoryID",
      categoryBudgetSettings: "id, majorCategoryID, effectiveFrom",
      merchantCategoryMappings: "id, merchantKey",
      merchantExclusions: "id, merchantKey",
      bonusPeriods: "id, displayOrder",
      bonusBudgetSettings: null,
      recurringOverrides: "id, merchantKey",
      bonusCategoryPlans: "id, bonusPeriodID, year, majorCategoryID",
      bonusIncomeSchedules: "id, fundingSourceID",
      settings: "key",
    });
    this.version(8)
      .stores({
        transactions: "id, date, type, subcategoryID, sourceInstitutionID",
        fundingSources: "id",
        majorCategories: "id, displayOrder",
        subcategories: "id, majorCategoryID",
        categoryBudgetSettings: "id, majorCategoryID, effectiveFrom",
        merchantCategoryMappings: "id, merchantKey",
        merchantExclusions: "id, merchantKey",
        bonusPeriods: "id, displayOrder",
        recurringOverrides: "id, merchantKey",
        bonusCategoryPlans: "id, bonusPeriodID, year, majorCategoryID, subcategoryID",
        bonusIncomeSchedules: "id, fundingSourceID",
        settings: "key",
      })
      .upgrade(async (tx) => {
        await tx
          .table("bonusCategoryPlans")
          .toCollection()
          .modify((plan) => {
            if (plan.subcategoryID === undefined) plan.subcategoryID = null;
          });
      });
    this.version(9).stores({
      transactions: "id, date, type, subcategoryID, sourceInstitutionID",
      fundingSources: "id",
      majorCategories: "id, displayOrder",
      subcategories: "id, majorCategoryID",
      categoryBudgetSettings: "id, majorCategoryID, effectiveFrom",
      merchantCategoryMappings: "id, merchantKey",
      merchantExclusions: "id, merchantKey",
      bonusPeriods: "id, displayOrder",
      recurringOverrides: "id, merchantKey",
      bonusCategoryPlans: "id, bonusPeriodID, year, majorCategoryID, subcategoryID",
      bonusIncomeSchedules: "id, fundingSourceID",
      apiUsageLogs: "id, createdAt",
      settings: "key",
    });
    this.version(10).stores({
      transactions: "id, date, type, subcategoryID, sourceInstitutionID",
      fundingSources: "id",
      majorCategories: "id, displayOrder",
      subcategories: "id, majorCategoryID",
      categoryBudgetSettings: "id, majorCategoryID, effectiveFrom",
      merchantCategoryMappings: "id, merchantKey",
      merchantExclusions: "id, merchantKey",
      merchantAmbiguousFlags: "id, merchantKey",
      bonusPeriods: "id, displayOrder",
      recurringOverrides: "id, merchantKey",
      bonusCategoryPlans: "id, bonusPeriodID, year, majorCategoryID, subcategoryID",
      bonusIncomeSchedules: "id, fundingSourceID",
      apiUsageLogs: "id, createdAt",
      settings: "key",
    });
    this.version(11).stores({
      transactions: "id, date, type, subcategoryID, sourceInstitutionID",
      fundingSources: "id",
      majorCategories: "id, displayOrder",
      subcategories: "id, majorCategoryID",
      categoryBudgetSettings: "id, majorCategoryID, effectiveFrom",
      merchantCategoryMappings: "id, merchantKey",
      merchantExclusions: "id, merchantKey",
      merchantAmbiguousFlags: "id, merchantKey",
      bonusPeriods: "id, displayOrder",
      recurringOverrides: "id, merchantKey",
      bonusCategoryPlans: "id, bonusPeriodID, year, majorCategoryID, subcategoryID",
      bonusIncomeSchedules: "id, fundingSourceID",
      apiUsageLogs: null,
      settings: "key",
    });
    this.version(12).stores({
      transactions: "id, date, type, subcategoryID, sourceInstitutionID",
      fundingSources: "id",
      majorCategories: "id, displayOrder",
      subcategories: "id, majorCategoryID",
      categoryBudgetSettings: "id, majorCategoryID, effectiveFrom",
      merchantCategoryMappings: "id, merchantKey",
      merchantExclusions: "id, merchantKey",
      merchantAmbiguousFlags: "id, merchantKey",
      bonusPeriods: "id, displayOrder",
      recurringOverrides: "id, merchantKey",
      bonusCategoryPlans: "id, bonusPeriodID, year, majorCategoryID, subcategoryID",
      bonusIncomeSchedules: "id, fundingSourceID",
      plannedExpenses: "id, month",
      settings: "key",
    });
    this.version(13).stores({
      transactions: "id, date, type, subcategoryID, sourceInstitutionID",
      fundingSources: "id",
      majorCategories: "id, displayOrder",
      subcategories: "id, majorCategoryID",
      categoryBudgetSettings: "id, majorCategoryID, effectiveFrom",
      merchantCategoryMappings: "id, merchantKey",
      merchantExclusions: "id, merchantKey",
      merchantAmbiguousFlags: "id, merchantKey",
      bonusPeriods: "id, displayOrder",
      recurringOverrides: "id, merchantKey",
      bonusCategoryPlans: "id, bonusPeriodID, year, majorCategoryID, subcategoryID",
      bonusIncomeSchedules: "id, fundingSourceID",
      plannedExpenses: "id, month",
      budgetAdjustments: "id, month",
      settings: "key",
    });
    this.version(14)
      .stores({
        transactions: "id, date, type, subcategoryID, sourceInstitutionID",
        fundingSources: "id",
        majorCategories: "id, displayOrder",
        subcategories: "id, majorCategoryID",
        categoryBudgetSettings: "id, majorCategoryID, effectiveFrom",
        merchantCategoryMappings: "id, merchantKey",
        merchantExclusions: "id, merchantKey",
        merchantAmbiguousFlags: "id, merchantKey",
        bonusPeriods: "id, displayOrder",
        recurringOverrides: "id, merchantKey",
        bonusCategoryPlans: "id, bonusPeriodID, year, majorCategoryID, subcategoryID",
        bonusIncomeSchedules: "id, fundingSourceID",
        plannedExpenses: null,
        budgetAdjustments: "id, month",
        specificMonthPlans: "id, merchantKey, month",
        settings: "key",
      })
      .upgrade(async (tx) => {
        await tx
          .table("recurringOverrides")
          .toCollection()
          .modify((override) => {
            if (override.type === undefined) {
              override.type = override.isRecurring ? "monthly" : "spontaneous";
            }
            delete override.isRecurring;
          });
      });
  }
}

export const db = new KakeiboDB();
