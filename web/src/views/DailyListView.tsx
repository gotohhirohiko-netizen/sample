import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { formatMonthDay, formatYearMonth, isSameMonth, parseMonthParam } from "../lib/dateUtils";
import TransactionRow from "../components/TransactionRow";

/** 日次収支リスト表示機能(要件定義書 4.4) */
export default function DailyListView() {
  const { month: monthParam } = useParams();
  const month = parseMonthParam(monthParam);

  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const fundingSources = useLiveQuery(() => db.fundingSources.toArray(), []);

  if (!transactions || !fundingSources) {
    return <p className="muted">読み込み中...</p>;
  }

  const monthTx = transactions
    .filter((t) => isSameMonth(new Date(t.date), month))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const groups = new Map<string, typeof monthTx>();
  for (const tx of monthTx) {
    const dayKey = tx.date.slice(0, 10);
    const group = groups.get(dayKey) ?? [];
    group.push(tx);
    groups.set(dayKey, group);
  }

  return (
    <div>
      <Link to="/" className="back-link">
        ‹ ホームへ戻る
      </Link>
      <h1 className="screen-title">{formatYearMonth(month)}</h1>

      {[...groups.entries()].map(([dayKey, items]) => (
        <div className="section" key={dayKey}>
          <div className="section-title">{formatMonthDay(new Date(dayKey))}</div>
          <div className="list">
            {items.map((tx) => (
              <TransactionRow key={tx.id} transaction={tx} fundingSources={fundingSources} />
            ))}
          </div>
        </div>
      ))}

      {monthTx.length === 0 && <p className="muted">この月の取引はまだありません</p>}
    </div>
  );
}
