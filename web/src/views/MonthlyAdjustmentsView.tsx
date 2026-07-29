import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { merchantMatchKey } from "../lib/categoryResolver";
import { formatYearMonth, formatYen, parseMonthParam } from "../lib/dateUtils";
import { specificTypeMerchantCandidates } from "../lib/recurringResolver";

/**
 * 当月の計画・予算調整の登録画面。ホーム画面の「当月の計画・予算調整」の
 * 入り口から遷移し、この画面の中で2つの機能(計画/予算調整)を分けて扱う。
 * 計画の対象店名は、取引詳細画面で「該当月定常」に設定済みの店名から選ぶ
 * (一度も実績のない店名や、突発・毎月定常の店名は選択候補にならない)。
 */
export default function MonthlyAdjustmentsView() {
  const { month: monthParam } = useParams<{ month: string }>();
  const month = parseMonthParam(monthParam);
  const monthValue = monthParam ?? "";

  const [planFormOpen, setPlanFormOpen] = useState(false);
  const [planMerchant, setPlanMerchant] = useState("");
  const [planAmount, setPlanAmount] = useState("");
  const [adjustmentFormOpen, setAdjustmentFormOpen] = useState(false);
  const [adjustmentMemo, setAdjustmentMemo] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");

  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const recurringOverrides = useLiveQuery(() => db.recurringOverrides.toArray(), []);
  const specificMonthPlans = useLiveQuery(() => db.specificMonthPlans.toArray(), []);
  const budgetAdjustments = useLiveQuery(() => db.budgetAdjustments.toArray(), []);

  if (!transactions || !recurringOverrides || !specificMonthPlans || !budgetAdjustments) {
    return <p className="muted">読み込み中...</p>;
  }

  const monthPlans = specificMonthPlans.filter((p) => p.month === monthValue);
  const monthBudgetAdjustments = budgetAdjustments.filter((a) => a.month === monthValue);
  const planCandidates = specificTypeMerchantCandidates(transactions, recurringOverrides);

  const allTransactions = transactions;
  function displayNameForMerchantKey(key: string): string {
    const match = allTransactions
      .filter((t) => merchantMatchKey(t.merchant) === key)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    return match?.merchant ?? key;
  }

  async function addPlan() {
    const amount = Number(planAmount);
    if (planMerchant.trim() === "" || !Number.isFinite(amount) || amount <= 0) return;
    const merchantKey = merchantMatchKey(planMerchant);
    if (monthPlans.some((p) => p.merchantKey === merchantKey)) return;
    await db.specificMonthPlans.add({
      id: crypto.randomUUID(),
      merchantKey,
      month: monthValue,
      amount,
    });
    setPlanMerchant("");
    setPlanAmount("");
    setPlanFormOpen(false);
  }

  async function deletePlan(id: string) {
    if (!confirm("この計画を削除しますか?")) return;
    await db.specificMonthPlans.delete(id);
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
        <div className="section-title">計画</div>
        <p className="muted">
          該当月定常(取引詳細画面で設定)の店名について、今月発生する金額を登録すると月末着地予想に反映されます。
        </p>

        {monthPlans.length > 0 && (
          <div className="list" style={{ marginTop: 8 }}>
            {monthPlans.map((p) => (
              <div key={p.id} className="list-row">
                <span>{displayNameForMerchantKey(p.merchantKey)}</span>
                <div className="button-row">
                  <span className="muted">{formatYen(p.amount)}</span>
                  <button type="button" className="btn-secondary" onClick={() => deletePlan(p.id)}>
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {planFormOpen ? (
          planCandidates.length > 0 ? (
            <div className="section" style={{ marginTop: 8 }}>
              <div className="form-row">
                <label>店名</label>
                <select value={planMerchant} onChange={(e) => setPlanMerchant(e.target.value)}>
                  <option value="">選択してください</option>
                  {planCandidates.map((merchant) => (
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
                  value={planAmount}
                  onChange={(e) => setPlanAmount(e.target.value)}
                />
              </div>
              <div className="button-row">
                <button type="button" className="btn-primary" onClick={addPlan}>
                  追加
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setPlanFormOpen(false);
                    setPlanMerchant("");
                    setPlanAmount("");
                  }}
                >
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <p className="muted" style={{ marginTop: 8 }}>
              計画として登録できる店名がありません(取引詳細画面で「該当月定常」に設定した店名が対象です)
            </p>
          )
        ) : (
          <button
            type="button"
            className="btn-secondary"
            style={{ marginTop: 8 }}
            onClick={() => setPlanFormOpen(true)}
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
