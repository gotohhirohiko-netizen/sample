import { useEffect, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { downloadBackup, exportBackup, restoreBackup, type BackupPayload } from "../lib/backup";
import { loadLastBackupAt } from "../lib/keyStorage";

/**
 * バックアップ/復元画面(docs/design.md 8章)。
 * iOS Safariはローカルストレージを一定期間の無操作後に消去することがあるため、
 * v1スコープとして提供する。
 */
export default function BackupView() {
  const [lastBackupAt, setLastBackupAt] = useState<Date | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadLastBackupAt().then(setLastBackupAt);
  }, []);

  async function handleExport() {
    const payload = await exportBackup();
    downloadBackup(payload);
    setLastBackupAt(new Date());
    setMessage("バックアップファイルをダウンロードしました");
  }

  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as BackupPayload;
      if (!confirm("現在のデータをすべて置き換えて復元します。よろしいですか?")) return;
      await restoreBackup(payload);
      setMessage("復元しました");
    } catch {
      setMessage("復元に失敗しました。ファイルの内容を確認してください");
    }
  }

  return (
    <div>
      <Link to="/settings" className="back-link">
        ‹ 設定へ戻る
      </Link>
      <h1 className="screen-title">バックアップ/復元</h1>

      <p className="muted">
        iOS Safariは一定期間操作の無いサイトのデータを消去することがあります。定期的にバックアップを取ることを推奨します。
      </p>
      <p className="muted">
        最終バックアップ: {lastBackupAt ? lastBackupAt.toLocaleString("ja-JP") : "まだありません"}
      </p>

      <div className="section">
        <button type="button" className="btn-primary" onClick={handleExport}>
          バックアップをダウンロード
        </button>
      </div>

      <div className="section">
        <div className="section-title">復元</div>
        <input type="file" accept="application/json" onChange={handleImport} />
      </div>

      {message && <p className="muted">{message}</p>}
    </div>
  );
}
