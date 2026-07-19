import { db } from "./db";

const API_KEY_SETTING = "anthropicApiKey";
const LAST_BACKUP_SETTING = "lastBackupAt";
const DAILY_LIST_UNCLASSIFIED_ONLY_SETTING = "dailyListUnclassifiedOnly";
const DAILY_LIST_SORT_MODE_SETTING = "dailyListSortMode";
const DAILY_LIST_SPONTANEOUS_ONLY_SETTING = "dailyListSpontaneousOnly";
const AUTO_BACKUP_ON_IMPORT_SETTING = "autoBackupOnImport";

export type DailyListSortMode = "date" | "amount";

/**
 * Anthropic APIキーの保存(docs/design.md 4.1、要件定義書 5.1)。
 * iOS Keychainのようなハードウェア保護は無い点に注意(個人非公開PWAとして許容)。
 */
export async function saveApiKey(key: string): Promise<void> {
  await db.settings.put({ key: API_KEY_SETTING, value: key.trim() });
}

export async function loadApiKey(): Promise<string | null> {
  const entry = await db.settings.get(API_KEY_SETTING);
  return entry?.value.trim() ?? null;
}

export async function clearApiKey(): Promise<void> {
  await db.settings.delete(API_KEY_SETTING);
}

export async function saveLastBackupAt(date: Date): Promise<void> {
  await db.settings.put({ key: LAST_BACKUP_SETTING, value: date.toISOString() });
}

export async function loadLastBackupAt(): Promise<Date | null> {
  const entry = await db.settings.get(LAST_BACKUP_SETTING);
  return entry ? new Date(entry.value) : null;
}

/** 日次収支リストの「未分類のみ表示」フィルタ設定を保存する(画面遷移をまたいで保持するため) */
export async function saveUnclassifiedOnlyFilter(value: boolean): Promise<void> {
  await db.settings.put({ key: DAILY_LIST_UNCLASSIFIED_ONLY_SETTING, value: String(value) });
}

export async function loadUnclassifiedOnlyFilter(): Promise<boolean> {
  const entry = await db.settings.get(DAILY_LIST_UNCLASSIFIED_ONLY_SETTING);
  return entry?.value === "true";
}

/** 日次収支リストの並び順設定を保存する(画面遷移をまたいで保持するため) */
export async function saveDailyListSortMode(mode: DailyListSortMode): Promise<void> {
  await db.settings.put({ key: DAILY_LIST_SORT_MODE_SETTING, value: mode });
}

export async function loadDailyListSortMode(): Promise<DailyListSortMode> {
  const entry = await db.settings.get(DAILY_LIST_SORT_MODE_SETTING);
  return entry?.value === "amount" ? "amount" : "date";
}

/** 日次収支リストの「突発費用のみ表示」フィルタ設定を保存する(画面遷移をまたいで保持するため) */
export async function saveSpontaneousOnlyFilter(value: boolean): Promise<void> {
  await db.settings.put({ key: DAILY_LIST_SPONTANEOUS_ONLY_SETTING, value: String(value) });
}

export async function loadSpontaneousOnlyFilter(): Promise<boolean> {
  const entry = await db.settings.get(DAILY_LIST_SPONTANEOUS_ONLY_SETTING);
  return entry?.value === "true";
}

/** 取り込み確定時の自動バックアップ設定を保存する(デフォルトは有効) */
export async function saveAutoBackupOnImport(value: boolean): Promise<void> {
  await db.settings.put({ key: AUTO_BACKUP_ON_IMPORT_SETTING, value: String(value) });
}

export async function loadAutoBackupOnImport(): Promise<boolean> {
  const entry = await db.settings.get(AUTO_BACKUP_ON_IMPORT_SETTING);
  return entry ? entry.value === "true" : true;
}
