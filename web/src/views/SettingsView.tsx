import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useRegisterSW } from "virtual:pwa-register/react";
import { loadApiKey, saveApiKey } from "../lib/keyStorage";
import {
  isLockEnabled,
  isPlatformAuthenticatorAvailable,
  registerLock,
  removeLock,
} from "../lib/webauthnLock";
import { clearPwaCachesAndReload } from "../lib/pwaMaintenance";
import { formatDateTime } from "../lib/dateUtils";

/** 設定画面: APIキー入力、各種管理画面への導線(要件定義書 5.1) */
export default function SettingsView() {
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lockEnabled, setLockEnabled] = useState(false);
  const [platformAuthAvailable, setPlatformAuthAvailable] = useState(false);
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const [checkingForUpdate, setCheckingForUpdate] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      registrationRef.current = registration ?? null;
    },
  });

  useEffect(() => {
    loadApiKey().then((key) => setApiKey(key ?? ""));
    isLockEnabled().then(setLockEnabled);
    isPlatformAuthenticatorAvailable().then(setPlatformAuthAvailable);
  }, []);

  async function handleEnableLock() {
    try {
      await registerLock();
      setLockEnabled(true);
      setLockMessage("ロックを設定しました");
    } catch {
      setLockMessage("設定に失敗しました。もう一度お試しください");
    }
    setTimeout(() => setLockMessage(null), 3000);
  }

  async function handleDisableLock() {
    if (!confirm("ロックを解除しますか?")) return;
    await removeLock();
    setLockEnabled(false);
    setLockMessage("ロックを解除しました");
    setTimeout(() => setLockMessage(null), 3000);
  }

  async function handleSave() {
    const trimmed = apiKey.trim();
    await saveApiKey(trimmed);
    setApiKey(trimmed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleCopy() {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleCheckForUpdate() {
    setCheckingForUpdate(true);
    try {
      await registrationRef.current?.update();
    } finally {
      setTimeout(() => setCheckingForUpdate(false), 1500);
    }
  }

  async function handleClearCache() {
    if (
      !confirm(
        "アプリのキャッシュを削除して再読み込みします。保存されている家計簿データは削除されません。よろしいですか?"
      )
    )
      return;
    await clearPwaCachesAndReload();
  }

  return (
    <div>
      <h1 className="screen-title">設定</h1>

      <div className="section">
        <div className="section-title">Anthropic APIキー</div>
        <div className="form-row">
          <input
            type={visible ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
          />
        </div>
        <div className="button-row">
          <button type="button" className="btn-primary" onClick={handleSave}>
            保存
          </button>
          <button type="button" onClick={() => setVisible((v) => !v)}>
            {visible ? "隠す" : "表示"}
          </button>
          <button type="button" onClick={handleCopy}>
            コピー
          </button>
        </div>
        {saved && <p className="muted">保存しました</p>}
        {copied && <p className="muted">コピーしました</p>}
      </div>

      <div className="section">
        <div className="section-title">セキュリティ</div>
        {!platformAuthAvailable && (
          <p className="muted">この端末はFace ID/Touch IDでのロックに対応していません</p>
        )}
        {platformAuthAvailable && !lockEnabled && (
          <>
            <p className="muted">
              Face ID/Touch IDでアプリ起動時にロックできます。設定前に必ずバックアップを取ってください
              — 機種変更や認証情報のリセットでロックが解除できなくなった場合、復旧手段はブラウザの
              サイトデータ消去(全データ削除)のみです。
            </p>
            <button type="button" className="btn-primary" onClick={handleEnableLock}>
              Face ID/Touch IDでロックを設定
            </button>
          </>
        )}
        {lockEnabled && (
          <>
            <p className="muted">ロック設定済みです</p>
            <button type="button" className="btn-secondary" onClick={handleDisableLock}>
              ロックを解除
            </button>
          </>
        )}
        {lockMessage && <p className="muted">{lockMessage}</p>}
      </div>

      <div className="section">
        <div className="section-title">アプリ情報</div>
        <p className="muted">
          バージョン {__APP_VERSION__}(ビルド: {formatDateTime(new Date(__BUILD_TIME__))})
        </p>
        <div className="button-row">
          {needRefresh ? (
            <button type="button" className="btn-primary" onClick={() => updateServiceWorker(true)}>
              新しいバージョンに更新
            </button>
          ) : (
            <button type="button" onClick={handleCheckForUpdate} disabled={checkingForUpdate}>
              {checkingForUpdate ? "確認中..." : "更新を確認"}
            </button>
          )}
          <button type="button" onClick={handleClearCache}>
            キャッシュを削除して再読み込み
          </button>
        </div>
      </div>

      <div className="section list">
        <Link to="/settings/categories" className="list-row">
          カテゴリ・予算管理
        </Link>
        <Link to="/bonus" className="list-row">
          ボーナス計画
        </Link>
        <Link to="/settings/sources" className="list-row">
          取り込み元管理
        </Link>
        <Link to="/settings/backup" className="list-row">
          バックアップ/復元
        </Link>
        <Link to="/settings/import-history" className="list-row">
          取り込み履歴
        </Link>
        <Link to="/settings/api-usage" className="list-row">
          API使用量
        </Link>
      </div>
    </div>
  );
}
