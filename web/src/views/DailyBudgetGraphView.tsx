import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import {
  daysInMonth,
  formatYen,
  isSameMonth,
  monthToParam,
  parseMonthParam,
} from "../lib/dateUtils";
import TransactionRow from "../components/TransactionRow";
import MonthPicker from "../components/MonthPicker";

/** 日次収支リストの日毎グラフ表示(1日〜月末まで、日付順に棒グラフで並べる) */
export default function DailyBudgetGraphView() {
  const { month: monthParam } = useParams();
  const month = parseMonthParam(monthParam);
  const navigate = useNavigate();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  function handleMonthChange(newMonth: Date) {
    navigate(`/daily/${monthToParam(newMonth)}/graph`, { replace: true });
    setSelectedDay(null);
  }

  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const fundingSources = useLiveQuery(() => db.fundingSources.toArray(), []);
  const subcategories = useLiveQuery(() => db.subcategories.toArray(), []);
  const majorCategories = useLiveQuery(() => db.majorCategories.toArray(), []);

  if (!transactions || !fundingSources || !subcategories || !majorCategories) {
    return <p className="muted">読み込み中...</p>;
  }

  const monthExpenses = transactions.filter(
    (t) => t.type === "expense" && !t.excludedFromBudget && isSameMonth(new Date(t.date), month)
  );

  const totalDays = daysInMonth(month);
  const bars = Array.from({ length: totalDays }, (_, i) => {
    const day = i + 1;
    const dayTx = monthExpenses.filter((t) => new Date(t.date).getDate() === day);
    return {
      day,
      total: dayTx.reduce((sum, t) => sum + t.amount, 0),
      transactions: dayTx,
    };
  });

  const maxValue = Math.max(1, ...bars.map((b) => b.total));
  const selectedBar = selectedDay !== null ? bars.find((b) => b.day === selectedDay) : undefined;

  return (
    <div>
      <Link to={`/daily/${monthParam}`} className="back-link">
        ‹ 日次収支リストへ戻る
      </Link>
      <h1 className="screen-title">日次グラフ</h1>
      <MonthPicker month={month} onChange={handleMonthChange} />
      <p className="muted">バーをタップすると、その日の取引を確認できます。</p>

      <div className="bar-chart">
        {bars.map((b) => (
          <button
            key={b.day}
            type="button"
            className="bar-chart-column"
            onClick={() => setSelectedDay((d) => (d === b.day ? null : b.day))}
          >
            {b.total > 0 && (
              <span className="bar-chart-value">{Math.round(b.total / 1000)}千</span>
            )}
            <div className="bar-chart-track">
              <div
                className={`bar-chart-bar ${b.day === selectedDay ? "selected" : ""}`}
                style={{ height: `${(b.total / maxValue) * 100}%` }}
              />
            </div>
            <span className="bar-chart-label">{b.day}</span>
          </button>
        ))}
      </div>

      {selectedBar && (
        <div className="section card">
          <div className="section-title">
            {month.getMonth() + 1}月{selectedBar.day}日({formatYen(selectedBar.total)})
          </div>
          {selectedBar.transactions.length > 0 ? (
            <div className="list" style={{ marginTop: 8 }}>
              {selectedBar.transactions.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  transaction={tx}
                  fundingSources={fundingSources}
                  subcategories={subcategories}
                  majorCategories={majorCategories}
                />
              ))}
            </div>
          ) : (
            <p className="muted">この日の支出はありません</p>
          )}
        </div>
      )}
    </div>
  );
}
