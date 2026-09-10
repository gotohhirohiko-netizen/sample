import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { isSameMonth, parseMonthParam } from "../lib/dateUtils";
import { useScrollRestoration } from "../lib/scrollRestoration";
import TransactionRow from "../components/TransactionRow";

/** 未分類(小カテゴリ未設定)取引一覧(月次予実画面からのドリルダウン) */
export default function UnclassifiedDrilldownView() {
  const { month: monthParam } = useParams();
  const month = parseMonthParam(monthParam);

  const subcategories = useLiveQuery(() => db.subcategories.toArray(), []);
  const majorCategories = useLiveQuery(
    () => db.majorCategories.orderBy("displayOrder").toArray(),
    []
  );
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const fundingSources = useLiveQuery(() => db.fundingSources.toArray(), []);

  const ready = !!(subcategories && majorCategories && transactions && fundingSources);
  useScrollRestoration(ready);

  if (!subcategories || !majorCategories || !transactions || !fundingSources) {
    return <p className="muted">読み込み中...</p>;
  }

  const items = transactions
    .filter(
      (t) =>
        t.type === "expense" &&
        !t.excludedFromBudget &&
        !t.isBonusPayment &&
        t.subcategoryID == null &&
        isSameMonth(new Date(t.date), month)
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div>
      <Link to={`/budget/${monthParam}`} className="back-link">
        ‹ 月次予実へ戻る
      </Link>
      <h1 className="screen-title">未分類</h1>

      <div className="list">
        {items.map((tx) => (
          <TransactionRow
            key={tx.id}
            transaction={tx}
            fundingSources={fundingSources}
            subcategories={subcategories}
            majorCategories={majorCategories}
          />
        ))}
      </div>
      {items.length === 0 && <p className="muted">この月に未分類の取引はありません</p>}
    </div>
  );
}
