import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { loadApiKey, saveApiKey } from "../lib/keyStorage";

/** 設定画面: APIキー入力、各種管理画面への導線(要件定義書 5.1) */
export default function SettingsView() {
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadApiKey().then((key) => setApiKey(key ?? ""));
  }, []);

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
