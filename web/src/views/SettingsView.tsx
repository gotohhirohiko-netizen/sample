import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { loadApiKey, saveApiKey } from "../lib/keyStorage";

/** 設定画面: APIキー入力、各種管理画面への導線(要件定義書 5.1) */
export default function SettingsView() {
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadApiKey().then((key) => setApiKey(key ?? ""));
  }, []);

  async function handleSave() {
    await saveApiKey(apiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <h1 className="screen-title">設定</h1>

      <div className="section">
        <div className="section-title">Anthropic APIキー</div>
        <div className="form-row">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
          />
        </div>
        <button type="button" className="btn-primary" onClick={handleSave}>
          保存
        </button>
        {saved && <p className="muted">保存しました</p>}
      </div>

      <div className="section list">
        <Link to="/settings/categories" className="list-row">
          カテゴリ・予算管理
        </Link>
        <Link to="/settings/sources" className="list-row">
          取り込み元管理
        </Link>
        <Link to="/settings/backup" className="list-row">
          バックアップ/復元
        </Link>
      </div>
    </div>
  );
}
