import { Link, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { formatDateTime } from "../lib/dateUtils";

/** 取り込み元選択画面(要件定義書 4.1/4.8) */
export default function ImportSourceSelectView() {
  const navigate = useNavigate();
  const fundingSources = useLiveQuery(() => db.fundingSources.toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);

  function openSource(sourceId: string, url: string) {
    // target="_blank"で新しいタブを開く形(window.open/リンク要素どちらも)だと、
    // ホーム画面追加(スタンドアロン)状態のiOSでそのタブがバックグラウンドの
    // ままになり、ログイン後もアプリに戻るまでダウンロードが始まらないことが
    // あった。新しいタブを作らず現在のウィンドウ自体を外部サイトへ遷移させる
    // ことで、iOSにSafariへの通常のアプリ切り替え(フォアグラウンド)として
    // 扱わせる。Reactの画面遷移を先に反映させてから遷移する。
    navigate("/import/file", { state: { sourceId } });
    setTimeout(() => {
      window.location.href = url;
    }, 0);
  }

  function lastImportedAt(sourceId: string): string | null {
    const matching = (transactions ?? []).filter((t) => t.sourceInstitutionID === sourceId);
    if (matching.length === 0) return null;
    return matching.reduce((latest, t) => (t.importedAt > latest ? t.importedAt : latest), matching[0].importedAt);
  }

  return (
    <div>
      <h1 className="screen-title">取り込み元を選択</h1>
      <p className="muted">
        タップすると明細ページに移動します。ログインしてCSV/PDFをダウンロードしたら、ホーム画面のアイコンからこのアプリに戻ってきてください。
      </p>

      <div className="list">
        {fundingSources?.map((source) => {
          const lastAt = lastImportedAt(source.id);
          return (
            <button
              key={source.id}
              type="button"
              className="list-row"
              onClick={() => openSource(source.id, source.statementDeepLinkURL)}
            >
              <div>
                <div>{source.displayName}</div>
                <div className="muted">
                  {lastAt ? `前回取り込み: ${formatDateTime(new Date(lastAt))}` : "まだ取り込んでいません"}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {fundingSources?.length === 0 && (
        <p className="muted">
          取り込み元が未登録です。<Link to="/settings/sources">設定 &gt; 取り込み元管理</Link>から追加してください。
        </p>
      )}
    </div>
  );
}
