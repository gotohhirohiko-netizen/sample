import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { isSameMonth, parseMonthParam } from "../lib/dateUtils";
import { useScrollRestoration } from "../lib/scrollRestoration";
import TransactionRow from "../components/TransactionRow";

/** カテゴリ別取引一覧(月次予実画面からのドリルダウン) */
export default function CategoryDrilldownView() {
  const { month: monthParam, majorCategoryId } = useParams();
  const month = parseMonthParam(monthParam);

  const majorCategory = useLiveQuery(
    () => (majorCategoryId ? db.majorCategories.get(majorCategoryId) : undefined),
    [majorCategoryId]
  );
  const subcategories = useLiveQuery(() => db.subcategories.toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const fundingSources = useLiveQuery(() => db.fundingSources.toArray(), []);

  const ready = !!(subcategories && transactions && fundingSources);
  useScrollRestoration(ready);

  if (!subcategories || !transactions || !fundingSources) {
    return <p className="muted">読み込み中...</p>;
  }

  const subcategoryIDs = new Set(
    subcategories.filter((s) => s.majorCategoryID === majorCategoryId).map((s) => s.id)
  );
  const items = transactions
    .filter((t) => t.type === "expense" && isSameMonth(new Date(t.date), month))
    .filter((t) => t.subcategoryID != null && subcategoryIDs.has(t.subcategoryID))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div>
      <Link to={`/budget/${monthParam}`} className="back-link">
        ‹ 月次予実へ戻る
      </Link>
      <h1 className="screen-title">{majorCategory?.name ?? ""}</h1>

      <div className="list">
        {items.map((tx) => (
          <TransactionRow
            key={tx.id}
            transaction={tx}
            fundingSources={fundingSources}
            subcategories={subcategories}
          />
        ))}
      </div>
      {items.length === 0 && <p className="muted">この月・カテゴリの取引はありません</p>}
    </div>
  );
}
