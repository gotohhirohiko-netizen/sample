import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { formatYearMonth, formatYen, parseMonthParam } from "../lib/dateUtils";

/**
 * 当月の予算調整の登録画面。ホーム画面の「当月の予算調整」の入り口から遷移する。
 * (毎月ではない該当月定常費用の登録は、店名ごとに取引詳細画面から行う)
 */
export default function MonthlyAdjustmentsView() {
  const { month: monthParam } = useParams<{ month: string }>();
  const month = parseMonthParam(monthParam);
  const monthValue = monthParam ?? "";

  const [adjustmentFormOpen, setAdjustmentFormOpen] = useState(false);
  const [adjustmentMemo, setAdjustmentMemo] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");

  const budgetAdjustments = useLiveQuery(() => db.budgetAdjustments.toArray(), []);

  if (!budgetAdjustments) {
    return <p className="muted">読み込み中...</p>;
  }

  const monthBudgetAdjustments = budgetAdjustments.filter((a) => a.month === monthValue);

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
      <h1 className="screen-title">{formatYearMonth(month)}の予算調整</h1>

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
