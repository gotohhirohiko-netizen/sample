import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { isSameMonth, parseMonthParam } from "../lib/dateUtils";
import { useScrollRestoration } from "../lib/scrollRestoration";
import TransactionRow from "../components/TransactionRow";

/** 小カテゴリ別取引一覧(カテゴリ内訳画面からのさらなるドリルダウン) */
export default function SubcategoryDrilldownView() {
  const { month: monthParam, subcategoryId } = useParams();
  const month = parseMonthParam(monthParam);
  const navigate = useNavigate();

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

  const ready = !!(
    subcategory !== undefined &&
    subcategories &&
    majorCategories &&
    transactions &&
    fundingSources
  );
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
        t.subcategoryID === subcategoryId &&
        isSameMonth(new Date(t.date), month)
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div>
      <button type="button" className="back-link" onClick={() => navigate(-1)}>
        ‹ 戻る
      </button>
      <h1 className="screen-title">{subcategory?.name ?? ""}</h1>

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
      {items.length === 0 && <p className="muted">この月・カテゴリの取引はありません</p>}
    </div>
  );
}
