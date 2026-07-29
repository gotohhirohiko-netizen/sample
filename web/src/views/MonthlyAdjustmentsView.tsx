import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { irregularMerchantCandidates } from "../lib/recurringResolver";
import { formatYearMonth, formatYen, parseMonthParam } from "../lib/dateUtils";

/**
 * 当月の計画支出・予算調整の登録画面。ホーム画面の「当月の計画・予算調整」の
 * 入り口から遷移し、この画面の中で2つの機能(計画支出/予算調整)を分けて扱う。
 */
export default function MonthlyAdjustmentsView() {
  const { month: monthParam } = useParams<{ month: string }>();
  const month = parseMonthParam(monthParam);
  const monthValue = monthParam ?? "";

  const [plannedFormOpen, setPlannedFormOpen] = useState(false);
  const [plannedLabel, setPlannedLabel] = useState("");
  const [plannedAmount, setPlannedAmount] = useState("");
  const [adjustmentFormOpen, setAdjustmentFormOpen] = useState(false);
  const [adjustmentMemo, setAdjustmentMemo] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");

  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const recurringOverrides = useLiveQuery(() => db.recurringOverrides.toArray(), []);
  const plannedExpenses = useLiveQuery(() => db.plannedExpenses.toArray(), []);
  const budgetAdjustments = useLiveQuery(() => db.budgetAdjustments.toArray(), []);

  if (!transactions || !recurringOverrides || !plannedExpenses || !budgetAdjustments) {
    return <p className="muted">読み込み中...</p>;
  }

  const monthPlannedExpenses = plannedExpenses.filter((p) => p.month === monthValue);
  const monthBudgetAdjustments = budgetAdjustments.filter((a) => a.month === monthValue);
  const plannedExpenseCandidates = irregularMerchantCandidates(transactions, recurringOverrides);

  async function addPlannedExpense() {
    const amount = Number(plannedAmount);
    if (plannedLabel.trim() === "" || !Number.isFinite(amount) || amount <= 0) return;
    await db.plannedExpenses.add({
      id: crypto.randomUUID(),
      month: monthValue,
      label: plannedLabel.trim(),
      plannedAmount: amount,
    });
    setPlannedLabel("");
    setPlannedAmount("");
    setPlannedFormOpen(false);
  }

  async function deletePlannedExpense(id: string) {
    if (!confirm("この計画を削除しますか?")) return;
    await db.plannedExpenses.delete(id);
  }

  async function addBudgetAdjustment() {
    const amount = Number(adjustmentAmount);
    if (!Number.isFinite(amount) || amount === 0) return;
    await db.budgetAdjustments.add({
      id: crypto.randomUUID(),
      month: monthValue,
      memo: adjustmentMemo.trim(),
      amount,
    });
    setAdjustmentMemo("");
    setAdjustmentAmount("");
    setAdjustmentFormOpen(false);
  }

  async function deleteBudgetAdjustment(id: string) {
    if (!confirm("この予算調整を削除しますか?")) return;
    await db.budgetAdjustments.delete(id);
  }

  return (
    <div>
      <Link to="/" className="back-link">
        ‹ ホームへ戻る
      </Link>
      <h1 className="screen-title">{formatYearMonth(month)}の計画・予算調整</h1>

      <div className="section card">
        <div className="section-title">計画支出</div>
        <p className="muted">
          毎月ではないが今月発生予定の高額出費(お米・美容院等)を登録すると、月末着地予想に反映されます。
        </p>

        {monthPlannedExpenses.length > 0 && (
          <div className="list" style={{ marginTop: 8 }}>
            {monthPlannedExpenses.map((p) => (
              <div key={p.id} className="list-row">
                <span>{p.label}</span>
                <div className="button-row">
                  <span className="muted">{formatYen(p.plannedAmount)}</span>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => deletePlannedExpense(p.id)}
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {plannedFormOpen ? (
          plannedExpenseCandidates.length > 0 ? (
            <div className="section" style={{ marginTop: 8 }}>
              <div className="form-row">
                <label>店名</label>
                <select value={plannedLabel} onChange={(e) => setPlannedLabel(e.target.value)}>
                  <option value="">選択してください</option>
                  {plannedExpenseCandidates.map((merchant) => (
                    <option key={merchant} value={merchant}>
                      {merchant}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>金額</label>
                <input
                  type="number"
                  min={0}
                  value={plannedAmount}
                  onChange={(e) => setPlannedAmount(e.target.value)}
                />
              </div>
              <div className="button-row">
                <button type="button" className="btn-primary" onClick={addPlannedExpense}>
                  追加
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setPlannedFormOpen(false);
                    setPlannedLabel("");
                    setPlannedAmount("");
                  }}
                >
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <p className="muted" style={{ marginTop: 8 }}>
              計画として登録できる店名の実績がありません(毎月ではない支出の実績が必要です)
            </p>
          )
        ) : (
          <button
            type="button"
            className="btn-secondary"
            style={{ marginTop: 8 }}
            onClick={() => setPlannedFormOpen(true)}
          >
            当月の計画を追加
          </button>
        )}
      </div>

      <div className="section card">
        <div className="section-title">予算調整</div>
        <p className="muted">当月の予算合計だけを一時的に増減できます(カテゴリ別の予算設定には影響しません)。</p>

        {monthBudgetAdjustments.length > 0 && (
          <div className="list" style={{ marginTop: 8 }}>
            {monthBudgetAdjustments.map((a) => (
              <div key={a.id} className="list-row">
                <span>{a.memo || "予算調整"}</span>
                <div className="button-row">
                  <span className="muted">
                    {a.amount > 0 ? "+" : ""}
                    {formatYen(a.amount)}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => deleteBudgetAdjustment(a.id)}
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {adjustmentFormOpen ? (
          <div className="section" style={{ marginTop: 8 }}>
            <div className="form-row">
              <label>理由(任意)</label>
              <input
                value={adjustmentMemo}
                onChange={(e) => setAdjustmentMemo(e.target.value)}
                placeholder="例: 冠婚葬祭で今月だけ増額"
              />
            </div>
            <div className="form-row">
              <label>増減額(増額は+、減額は-)</label>
              <input
                type="number"
                value={adjustmentAmount}
                onChange={(e) => setAdjustmentAmount(e.target.value)}
              />
            </div>
            <div className="button-row">
              <button type="button" className="btn-primary" onClick={addBudgetAdjustment}>
                追加
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setAdjustmentFormOpen(false);
                  setAdjustmentMemo("");
                  setAdjustmentAmount("");
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn-secondary"
            style={{ marginTop: 8 }}
            onClick={() => setAdjustmentFormOpen(true)}
          >
            当月の予算を増減する
          </button>
        )}
      </div>
    </div>
  );
}
