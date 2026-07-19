/**
 * ブラウザに永続化ストレージ(Storage API)を要求する。
 * 付与されると、ブラウザがストレージ容量不足時に自動的にデータを消去する
 * 対象から除外されやすくなる。ただしiOS Safariが一定期間操作の無い
 * サイトのデータを消去する挙動(ITP起因)を完全に防ぐ保証ではないため、
 * バックアップ/復元機能(design.md 8章)による備えは引き続き必要。
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function isStoragePersisted(): Promise<boolean> {
  if (!navigator.storage?.persisted) return false;
  try {
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}
