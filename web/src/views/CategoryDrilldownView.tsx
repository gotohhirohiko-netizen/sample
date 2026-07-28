import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { subcategoryActualAmount } from "../lib/budgetCalculator";
import { formatYen, parseMonthParam } from "../lib/dateUtils";
import { useScrollRestoration } from "../lib/scrollRestoration";

/** カテゴリ別内訳(月次予実画面からのドリルダウン)。小カテゴリごとの実績額一覧を表示する */
export default function CategoryDrilldownView() {
  const { month: monthParam, majorCategoryId } = useParams();
  const month = parseMonthParam(monthParam);

  const majorCategory = useLiveQuery(
    () => (majorCategoryId ? db.majorCategories.get(majorCategoryId) : undefined),
    [majorCategoryId]
  );
  const subcategories = useLiveQuery(() => db.subcategories.toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);

  const ready = !!(subcategories && transactions);
  useScrollRestoration(ready);

  if (!subcategories || !transactions) {
    return <p className="muted">読み込み中...</p>;
  }

  const categorySubcategories = subcategories
    .filter((s) => s.majorCategoryID === majorCategoryId)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <div>
      <Link to={`/budget/${monthParam}`} className="back-link">
        ‹ 月次予実へ戻る
      </Link>
      <h1 className="screen-title">{majorCategory?.name ?? ""}</h1>

      <div className="list">
        {categorySubcategories.map((sub) => {
          const actual = subcategoryActualAmount(sub.id, month, transactions);
          return (
            <Link
              key={sub.id}
              to={`/budget/${monthParam}/${majorCategoryId}/${sub.id}`}
              className="list-row"
            >
              <span>{sub.name}</span>
              <span className="amount">{formatYen(actual)}</span>
            </Link>
          );
        })}
      </div>
      {categorySubcategories.length === 0 && <p className="muted">小カテゴリがありません</p>}
    </div>
  );
}
