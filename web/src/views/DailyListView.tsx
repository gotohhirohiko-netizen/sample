import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import {
  formatMonthDay,
  isSameMonth,
  monthToParam,
  parseMonthParam,
} from "../lib/dateUtils";
import { useScrollRestoration } from "../lib/scrollRestoration";
import {
  type DailyListSortMode,
  loadDailyListSortMode,
  loadSpontaneousOnlyFilter,
  loadUnclassifiedOnlyFilter,
  saveDailyListSortMode,
  saveSpontaneousOnlyFilter,
  saveUnclassifiedOnlyFilter,
} from "../lib/keyStorage";
import { resolveRecurring } from "../lib/recurringResolver";
import TransactionRow from "../components/TransactionRow";
import MonthPicker from "../components/MonthPicker";

/** 日次収支リスト表示機能(要件定義書 4.4) */
export default function DailyListView() {
  const { month: monthParam } = useParams();
  const month = parseMonthParam(monthParam);
  const navigate = useNavigate();
  const [unclassifiedOnly, setUnclassifiedOnly] = useState(false);
  const [spontaneousOnly, setSpontaneousOnly] = useState(false);
  const [sortMode, setSortMode] = useState<DailyListSortMode>("date");

  function handleMonthChange(newMonth: Date) {
    navigate(`/daily/${monthToParam(newMonth)}`, { replace: true });
  }

  useEffect(() => {
    loadUnclassifiedOnlyFilter().then(setUnclassifiedOnly);
    loadSpontaneousOnlyFilter().then(setSpontaneousOnly);
    loadDailyListSortMode().then(setSortMode);
  }, []);

  function handleUnclassifiedOnlyChange(checked: boolean) {
    setUnclassifiedOnly(checked);
    saveUnclassifiedOnlyFilter(checked);
  }

  function handleSpontaneousOnlyChange(checked: boolean) {
    setSpontaneousOnly(checked);
    saveSpontaneousOnlyFilter(checked);
  }

  function handleSortModeChange(mode: DailyListSortMode) {
    setSortMode(mode);
    saveDailyListSortMode(mode);
  }

  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const fundingSources = useLiveQuery(() => db.fundingSources.toArray(), []);
  const subcategories = useLiveQuery(() => db.subcategories.toArray(), []);
  const majorCategories = useLiveQuery(() => db.majorCategories.toArray(), []);
  const recurringOverrides = useLiveQuery(() => db.recurringOverrides.toArray(), []);

  const ready = !!(transactions && fundingSources && subcategories && majorCategories && recurringOverrides);
  useScrollRestoration(ready);

  if (!transactions || !fundingSources || !subcategories || !majorCategories || !recurringOverrides) {
    return <p className="muted">読み込み中...</p>;
  }

  function isSpontaneous(merchant: string): boolean {
    return !resolveRecurring(merchant, transactions!, recurringOverrides!);
  }

  const filteredTx = transactions
    .filter((t) => isSameMonth(new Date(t.date), month))
    .filter((t) => !unclassifiedOnly || (t.type === "expense" && t.subcategoryID == null))
    .filter((t) => !spontaneousOnly || (t.type === "expense" && isSpontaneous(t.merchant)));

  const monthTx = [...filteredTx].sort((a, b) =>
    sortMode === "amount"
      ? b.amount - a.amount
      : new Date(b.date).getTime() - new Date(a.date).getTime()
  );

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
      <h1 className="screen-title">日次収支リスト</h1>
      <MonthPicker month={month} onChange={handleMonthChange} />

      <label className="filter-row">
        <input
          type="checkbox"
          checked={unclassifiedOnly}
          onChange={(e) => handleUnclassifiedOnlyChange(e.target.checked)}
        />
        未分類のみ表示
      </label>

      <label className="filter-row">
        <input
          type="checkbox"
          checked={spontaneousOnly}
          onChange={(e) => handleSpontaneousOnlyChange(e.target.checked)}
        />
        突発費用のみ表示
      </label>

      <div className="form-row">
        <label>並び順</label>
        <select
          value={sortMode}
          onChange={(e) => handleSortModeChange(e.target.value as DailyListSortMode)}
        >
          <option value="date">日付順</option>
          <option value="amount">金額順</option>
        </select>
      </div>

      {sortMode === "date" ? (
        [...groups.entries()].map(([dayKey, items]) => (
          <div className="section" key={dayKey}>
            <div className="section-title">{formatMonthDay(new Date(dayKey))}</div>
            <div className="list">
              {items.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  transaction={tx}
                  fundingSources={fundingSources}
                  subcategories={subcategories}
                  majorCategories={majorCategories}
                  isSpontaneous={isSpontaneous(tx.merchant)}
                />
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="list">
          {monthTx.map((tx) => (
            <TransactionRow
              key={tx.id}
              transaction={tx}
              fundingSources={fundingSources}
              subcategories={subcategories}
              majorCategories={majorCategories}
              isSpontaneous={isSpontaneous(tx.merchant)}
            />
          ))}
        </div>
      )}

      {monthTx.length === 0 && (
        <p className="muted">
          {unclassifiedOnly ? "未分類の取引はありません" : "この月の取引はまだありません"}
        </p>
      )}
    </div>
  );
}
