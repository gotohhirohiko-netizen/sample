import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { formatDateTime, formatYen } from "../lib/dateUtils";
import type { Transaction } from "../types/models";

interface ImportBatch {
  importedAt: string;
  sourceInstitutionID: string;
  transactions: Transaction[];
}

/** 取り込み履歴の削除画面。同じタイミングで取り込んだ取引をまとめて削除できる */
export default function ImportHistoryView() {
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const fundingSources = useLiveQuery(() => db.fundingSources.toArray(), []);

  if (!transactions || !fundingSources) {
    return <p className="muted">読み込み中...</p>;
  }

  const batchMap = new Map<string, ImportBatch>();
  for (const tx of transactions) {
    const existing = batchMap.get(tx.importedAt);
    if (existing) {
      existing.transactions.push(tx);
    } else {
      batchMap.set(tx.importedAt, {
        importedAt: tx.importedAt,
        sourceInstitutionID: tx.sourceInstitutionID,
        transactions: [tx],
      });
    }
  }
  const batches = [...batchMap.values()].sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1));

  async function handleDelete(batch: ImportBatch) {
    if (
      !confirm(
        `${formatDateTime(new Date(batch.importedAt))}に取り込んだ${batch.transactions.length}件の取引を削除しますか?この操作は取り消せません。`
      )
    ) {
      return;
    }
    await db.transactions.bulkDelete(batch.transactions.map((t) => t.id));
  }

  return (
    <div>
      <Link to="/settings" className="back-link">
        ‹ 設定へ戻る
      </Link>
      <h1 className="screen-title">取り込み履歴</h1>

      <div className="list">
        {batches.map((batch) => {
          const sourceName =
            fundingSources.find((s) => s.id === batch.sourceInstitutionID)?.displayName ?? "不明";
          const total = batch.transactions.reduce(
            (sum, t) => sum + (t.type === "income" ? t.amount : -t.amount),
            0
          );
          return (
            <div key={batch.importedAt} className="card">
              <div>{formatDateTime(new Date(batch.importedAt))}</div>
              <div className="muted">
                {sourceName} ・ {batch.transactions.length}件 ・ {formatYen(total)}
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleDelete(batch)}
                style={{ marginTop: 8 }}
              >
                この取り込み分を削除
              </button>
            </div>
          );
        })}
      </div>

      {batches.length === 0 && <p className="muted">取り込み履歴はまだありません</p>}
    </div>
  );
}
