/**
 * Service WorkerとCache Storage(静的アセットのキャッシュ)を全て削除して再読み込みする。
 * IndexedDB(取引データ等)には触れないため、家計簿のデータが消えることはない。
 */
export async function clearPwaCachesAndReload(): Promise<void> {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  window.location.reload();
}
