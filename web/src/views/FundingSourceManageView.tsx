import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import type { FundingSourceKind } from "../types/models";

/** 取り込み元管理画面(要件定義書 4.8) */
export default function FundingSourceManageView() {
  const fundingSources = useLiveQuery(() => db.fundingSources.toArray(), []);

  const [displayName, setDisplayName] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<FundingSourceKind>("creditCard");

  async function addSource() {
    if (displayName.trim() === "" || url.trim() === "") return;
    await db.fundingSources.add({
      id: crypto.randomUUID(),
      displayName: displayName.trim(),
      kind,
      statementDeepLinkURL: url.trim(),
    });
    setDisplayName("");
    setUrl("");
  }

  async function removeSource(id: string) {
    if (!confirm("この取り込み元を削除しますか?")) return;
    await db.fundingSources.delete(id);
  }

  return (
    <div>
      <Link to="/settings" className="back-link">
        ‹ 設定へ戻る
      </Link>
      <h1 className="screen-title">取り込み元管理</h1>

      <div className="list">
        {fundingSources?.map((source) => (
          <div key={source.id} className="card">
            <div>{source.displayName}</div>
            <div className="muted">{source.kind === "bankAccount" ? "銀行口座" : "クレジットカード"}</div>
            <div className="muted" style={{ wordBreak: "break-all" }}>
              {source.statementDeepLinkURL}
            </div>
            <button type="button" className="btn-secondary" onClick={() => removeSource(source.id)}>
              削除
            </button>
          </div>
        ))}
      </div>

      <div className="section" style={{ marginTop: 16 }}>
        <div className="section-title">取り込み元を追加</div>
        <div className="form-row">
          <label>表示名</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="例: 楽天カード" />
        </div>
        <div className="form-row">
          <label>明細ページURL</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div className="form-row">
          <label>種別</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as FundingSourceKind)}>
            <option value="bankAccount">銀行口座</option>
            <option value="creditCard">クレジットカード</option>
          </select>
        </div>
        <button type="button" className="btn-primary" onClick={addSource}>
          追加
        </button>
      </div>
    </div>
  );
}
