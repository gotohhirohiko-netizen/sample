import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { bonusPeriodRange } from "../lib/bonusCalculator";
import TransactionRow from "../components/TransactionRow";

/** ボーナス予実画面からのドリルダウン。特定カテゴリの計画に対する取引履歴を表示する */
export default function BonusCategoryHistoryView() {
  const { periodId, year: yearParam, planId } = useParams<{
    periodId: string;
    year: string;
    planId: string;
  }>();
  const year = Number(yearParam);

  const bonusPeriods = useLiveQuery(() => db.bonusPeriods.orderBy("displayOrder").toArray(), []);
  const bonusCategoryPlans = useLiveQuery(() => db.bonusCategoryPlans.toArray(), []);
  const majorCategories = useLiveQuery(
    () => db.majorCategories.orderBy("displayOrder").toArray(),
    []
  );
  const subcategories = useLiveQuery(() => db.subcategories.toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const fundingSources = useLiveQuery(() => db.fundingSources.toArray(), []);

  if (
    !bonusPeriods ||
    !bonusCategoryPlans ||
    !majorCategories ||
    !subcategories ||
    !transactions ||
    !fundingSources
  ) {
    return <p className="muted">読み込み中...</p>;
  }

  const period = bonusPeriods.find((p) => p.id === periodId);
  const plan = bonusCategoryPlans.find((p) => p.id === planId);
  if (!period || !plan) {
    return (
      <div>
        <p className="muted">計画が見つかりません。</p>
        <Link to={`/bonus-actual/${periodId}/${year}`} className="back-link">
          ‹ ボーナス予実へ戻る
        </Link>
      </div>
    );
  }

  const major = majorCategories.find((m) => m.id === plan.majorCategoryID);
  const sub = plan.subcategoryID ? subcategories.find((s) => s.id === plan.subcategoryID) : undefined;
  const planLabel = sub ? `${major?.name ?? "不明"} / ${sub.name}` : major?.name ?? "不明";

  const { start, end } = bonusPeriodRange(period, year);
  const subcategoryIDs = plan.subcategoryID
    ? new Set([plan.subcategoryID])
    : new Set(subcategories.filter((s) => s.majorCategoryID === plan.majorCategoryID).map((s) => s.id));

  const items = transactions
    .filter(
      (t) =>
        t.type === "expense" &&
        t.isBonusPayment &&
        !t.excludedFromBudget &&
        t.subcategoryID != null &&
        subcategoryIDs.has(t.subcategoryID) &&
        new Date(t.date) >= start &&
        new Date(t.date) < end
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div>
      <Link to={`/bonus-actual/${period.id}/${year}`} className="back-link">
        ‹ ボーナス予実へ戻る
      </Link>
      <h1 className="screen-title">{planLabel}</h1>

      <div className="list">
        {items.map((tx) => (
          <TransactionRow key={tx.id} transaction={tx} fundingSources={fundingSources} subcategories={subcategories} />
        ))}
      </div>
      {items.length === 0 && <p className="muted">この計画に該当する取引はありません</p>}
    </div>
  );
}
