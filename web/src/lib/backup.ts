import { db } from "./db";
import { saveLastBackupAt } from "./keyStorage";
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
 * バックアップ・復元機能(docs/design.md 8章)。
 * iOS Safariはローカルストレージ(IndexedDB含む)を一定期間の無操作後に
 * 消去することがあるため、v1スコープとしてエクスポート/インポートを提供する。
 * APIキー(settings)は秘密情報のためバックアップ対象に含めない。
 */
export interface BackupPayload {
  exportedAt: string;
  transactions: Transaction[];
  fundingSources: FundingSource[];
  majorCategories: MajorCategory[];
  subcategories: Subcategory[];
  categoryBudgetSettings: CategoryBudgetSetting[];
  merchantCategoryMappings: MerchantCategoryMapping[];
  merchantExclusions: MerchantExclusion[];
  bonusPeriods: BonusPeriod[];
  bonusBudgetSettings: BonusBudgetSetting[];
  recurringOverrides: RecurringOverride[];
}

export async function exportBackup(): Promise<BackupPayload> {
  const [
    transactions,
    fundingSources,
    majorCategories,
    subcategories,
    categoryBudgetSettings,
    merchantCategoryMappings,
    merchantExclusions,
    bonusPeriods,
    bonusBudgetSettings,
    recurringOverrides,
  ] = await Promise.all([
    db.transactions.toArray(),
    db.fundingSources.toArray(),
    db.majorCategories.toArray(),
    db.subcategories.toArray(),
    db.categoryBudgetSettings.toArray(),
    db.merchantCategoryMappings.toArray(),
    db.merchantExclusions.toArray(),
    db.bonusPeriods.toArray(),
    db.bonusBudgetSettings.toArray(),
    db.recurringOverrides.toArray(),
  ]);

  const payload: BackupPayload = {
    exportedAt: new Date().toISOString(),
    transactions,
    fundingSources,
    majorCategories,
    subcategories,
    categoryBudgetSettings,
    merchantCategoryMappings,
    merchantExclusions,
    bonusPeriods,
    bonusBudgetSettings,
    recurringOverrides,
  };

  await saveLastBackupAt(new Date());
  return payload;
}

/** バックアップJSONをブラウザのダウンロード機能で保存する */
export function downloadBackup(payload: BackupPayload): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `kakeibo-backup-${payload.exportedAt.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/** バックアップJSONから全データを復元する(既存データはすべて置き換える) */
export async function restoreBackup(payload: BackupPayload): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.transactions,
      db.fundingSources,
      db.majorCategories,
      db.subcategories,
      db.categoryBudgetSettings,
      db.merchantCategoryMappings,
      db.merchantExclusions,
      db.bonusPeriods,
      db.bonusBudgetSettings,
      db.recurringOverrides,
    ],
    async () => {
      await Promise.all([
        db.transactions.clear(),
        db.fundingSources.clear(),
        db.majorCategories.clear(),
        db.subcategories.clear(),
        db.categoryBudgetSettings.clear(),
        db.merchantCategoryMappings.clear(),
        db.merchantExclusions.clear(),
        db.bonusPeriods.clear(),
        db.bonusBudgetSettings.clear(),
        db.recurringOverrides.clear(),
      ]);
      await Promise.all([
        db.transactions.bulkAdd(payload.transactions),
        db.fundingSources.bulkAdd(payload.fundingSources),
        db.majorCategories.bulkAdd(payload.majorCategories),
        db.subcategories.bulkAdd(payload.subcategories),
        db.categoryBudgetSettings.bulkAdd(payload.categoryBudgetSettings),
        db.merchantCategoryMappings.bulkAdd(payload.merchantCategoryMappings),
        db.merchantExclusions.bulkAdd(payload.merchantExclusions ?? []),
        db.bonusPeriods.bulkAdd(payload.bonusPeriods ?? []),
        db.bonusBudgetSettings.bulkAdd(payload.bonusBudgetSettings ?? []),
        db.recurringOverrides.bulkAdd(payload.recurringOverrides ?? []),
      ]);
    }
  );
}
