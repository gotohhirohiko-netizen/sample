import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { estimateCostUSD, formatUsd } from "../lib/costEstimator";
import { formatDateTime, isSameMonth } from "../lib/dateUtils";

/** 明細解析(Claude API)の使用量・概算コスト確認画面 */
export default function ApiUsageView() {
  const logs = useLiveQuery(() => db.apiUsageLogs.orderBy("createdAt").reverse().toArray(), []);
  const fundingSources = useLiveQuery(() => db.fundingSources.toArray(), []);

  if (!logs || !fundingSources) {
    return <p className="muted">読み込み中...</p>;
  }

  const now = new Date();
  const thisMonthLogs = logs.filter((l) => isSameMonth(new Date(l.createdAt), now));
  const totalCostThisMonth = thisMonthLogs.reduce(
    (sum, l) => sum + estimateCostUSD(l.model, l.inputTokens, l.outputTokens),
    0
  );
  const totalCostAllTime = logs.reduce(
    (sum, l) => sum + estimateCostUSD(l.model, l.inputTokens, l.outputTokens),
    0
  );

  return (
    <div>
      <Link to="/settings" className="back-link">
        ‹ 設定へ戻る
      </Link>
      <h1 className="screen-title">API使用量</h1>
      <p className="muted">
        Claude APIによる明細解析の使用量・概算コストです。取り込み時に決定的な列判定(楽天銀行のCSV等)が使われた場合はAPIを呼ばないため、ここには記録されません。
        正確な請求額はAnthropic Console(console.anthropic.com)のUsage/Billingページをご確認ください。
      </p>

      <div className="section card">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <strong>今月の概算コスト</strong>
          <span className="amount">{formatUsd(totalCostThisMonth)}</span>
        </div>
        <span className="muted">
          {thisMonthLogs.length}回の解析 / 累計 {formatUsd(totalCostAllTime)}({logs.length}回)
        </span>
      </div>

      <div className="section-title">解析履歴</div>
      <div className="list">
        {logs.map((log) => {
          const source = fundingSources.find((s) => s.id === log.sourceInstitutionID);
          const cost = estimateCostUSD(log.model, log.inputTokens, log.outputTokens);
          return (
            <div key={log.id} className="list-row">
              <div>
                <div>{source?.displayName ?? "不明な取り込み元"}</div>
                <div className="muted">
                  {formatDateTime(new Date(log.createdAt))} ・ {log.model}
                </div>
                <div className="muted">
                  入力{log.inputTokens.toLocaleString()}トークン / 出力{log.outputTokens.toLocaleString()}トークン
                </div>
              </div>
              <span className="amount">{formatUsd(cost)}</span>
            </div>
          );
        })}
        {logs.length === 0 && <p className="muted">まだ解析履歴はありません</p>}
      </div>
    </div>
  );
}
