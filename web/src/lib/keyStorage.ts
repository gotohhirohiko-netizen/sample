import { db } from "./db";

const API_KEY_SETTING = "anthropicApiKey";
const LAST_BACKUP_SETTING = "lastBackupAt";

/**
 * Anthropic APIキーの保存(docs/design.md 4.1、要件定義書 5.1)。
 * iOS Keychainのようなハードウェア保護は無い点に注意(個人非公開PWAとして許容)。
 */
export async function saveApiKey(key: string): Promise<void> {
  await db.settings.put({ key: API_KEY_SETTING, value: key });
}

export async function loadApiKey(): Promise<string | null> {
  const entry = await db.settings.get(API_KEY_SETTING);
  return entry?.value ?? null;
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
