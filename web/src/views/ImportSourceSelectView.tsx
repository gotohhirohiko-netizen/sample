import { Link, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";

/** 取り込み元選択画面(要件定義書 4.1/4.8) */
export default function ImportSourceSelectView() {
  const navigate = useNavigate();
  const fundingSources = useLiveQuery(() => db.fundingSources.toArray(), []);

  function openSource(sourceId: string, url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
    navigate("/import/file", { state: { sourceId } });
  }

  return (
    <div>
      <h1 className="screen-title">取り込み元を選択</h1>
      <p className="muted">
        タップすると明細ページが新しいタブで開きます。ログインしてCSV/PDFをダウンロードしたら、このタブに戻ってきてください。
      </p>

      <div className="list">
        {fundingSources?.map((source) => (
          <button
            key={source.id}
            type="button"
            className="list-row"
            onClick={() => openSource(source.id, source.statementDeepLinkURL)}
          >
            {source.displayName}
          </button>
        ))}
      </div>

      {fundingSources?.length === 0 && (
        <p className="muted">
          取り込み元が未登録です。<Link to="/settings/sources">設定 &gt; 取り込み元管理</Link>から追加してください。
        </p>
      )}
    </div>
  );
}
