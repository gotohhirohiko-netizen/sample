import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { isSameMonth, parseMonthParam } from "../lib/dateUtils";
import { useScrollRestoration } from "../lib/scrollRestoration";
import { resolveRecurring } from "../lib/recurringResolver";
import TransactionRow from "../components/TransactionRow";

/** 小カテゴリ別取引一覧(カテゴリ内訳画面からのさらなるドリルダウン) */
export default function SubcategoryDrilldownView() {
  const { month: monthParam, majorCategoryId, subcategoryId } = useParams();
  const month = parseMonthParam(monthParam);

  const subcategory = useLiveQuery(
    () => (subcategoryId ? db.subcategories.get(subcategoryId) : undefined),
    [subcategoryId]
  );
  const subcategories = useLiveQuery(() => db.subcategories.toArray(), []);
  const majorCategories = useLiveQuery(
    () => db.majorCategories.orderBy("displayOrder").toArray(),
    []
  );
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const fundingSources = useLiveQuery(() => db.fundingSources.toArray(), []);
  const recurringOverrides = useLiveQuery(() => db.recurringOverrides.toArray(), []);

  const ready = !!(
    subcategory !== undefined &&
    subcategories &&
    majorCategories &&
    transactions &&
    fundingSources &&
    recurringOverrides
  );
  useScrollRestoration(ready);

  if (!subcategories || !majorCategories || !transactions || !fundingSources || !recurringOverrides) {
    return <p className="muted">読み込み中...</p>;
  }

  const items = transactions
    .filter(
      (t) =>
        t.type === "expense" &&
        !t.excludedFromBudget &&
        !t.isBonusPayment &&
        t.subcategoryID === subcategoryId &&
        isSameMonth(new Date(t.date), month)
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div>
      <Link to={`/budget/${monthParam}/${majorCategoryId}`} className="back-link">
        ‹ 内訳へ戻る
      </Link>
      <h1 className="screen-title">{subcategory?.name ?? ""}</h1>

      <div className="list">
        {items.map((tx) => (
          <TransactionRow
            key={tx.id}
            transaction={tx}
            fundingSources={fundingSources}
            subcategories={subcategories}
            majorCategories={majorCategories}
            isSpontaneous={!resolveRecurring(tx.merchant, recurringOverrides)}
          />
        ))}
      </div>
      {items.length === 0 && <p className="muted">この月・カテゴリの取引はありません</p>}
    </div>
  );
}
