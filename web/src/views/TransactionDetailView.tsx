import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { merchantMatchKey } from "../lib/categoryResolver";
import { resolveRecurring } from "../lib/recurringResolver";
import type { Transaction } from "../types/models";

/** 取引詳細・編集画面(要件定義書 4.3)。カテゴリ手動修正時は学習マッピングをupsertする(4.9) */
export default function TransactionDetailView() {
  const { id } = useParams();
  const navigate = useNavigate();

  const transaction = useLiveQuery(() => (id ? db.transactions.get(id) : undefined), [id]);
  const majorCategories = useLiveQuery(
    () => db.majorCategories.orderBy("displayOrder").toArray(),
    []
  );
  const subcategories = useLiveQuery(() => db.subcategories.toArray(), []);
  const allTransactions = useLiveQuery(() => db.transactions.toArray(), []);
  const recurringOverrides = useLiveQuery(() => db.recurringOverrides.toArray(), []);

  const [merchant, setMerchant] = useState<string | null>(null);
  const [amount, setAmount] = useState<string | null>(null);
  const [memo, setMemo] = useState<string | null>(null);
  const [appliedCount, setAppliedCount] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exclusionAppliedCount, setExclusionAppliedCount] = useState<number | null>(null);

  if (!transaction || !majorCategories || !subcategories || !allTransactions || !recurringOverrides) {
    return <p className="muted">読み込み中...</p>;
  }

  const isExpense = transaction.type === "expense";
  const isRecurring = resolveRecurring(transaction.merchant, allTransactions, recurringOverrides);

  const currentSubcategory = subcategories.find((s) => s.id === transaction.subcategoryID);
  const currentMajorCategory = currentSubcategory
    ? majorCategories.find((m) => m.id === currentSubcategory.majorCategoryID)
    : undefined;
  const categoryLabel = currentSubcategory
    ? currentMajorCategory
      ? `${currentMajorCategory.name} / ${currentSubcategory.name}`
      : currentSubcategory.name
    : "未分類";

  const currentMerchant = merchant ?? transaction.merchant;
  const currentAmount = amount ?? String(transaction.amount);
  const currentMemo = memo ?? transaction.memo ?? "";

  async function saveField(field: Partial<Transaction>) {
    if (!transaction) return;
    await db.transactions.update(transaction.id, field);
  }

  async function handleCategoryChange(subcategoryID: string) {
    if (!transaction) return;
    const nextID = subcategoryID === "" ? null : subcategoryID;
    await db.transactions.update(transaction.id, { subcategoryID: nextID });
    setPickerOpen(false);

    if (nextID) {
      const key = merchantMatchKey(transaction.merchant);
      const existing = await db.merchantCategoryMappings
        .where("merchantKey")
        .equals(key)
        .first();
      if (existing) {
        await db.merchantCategoryMappings.update(existing.id, {
          subcategoryID: nextID,
          updatedAt: new Date().toISOString(),
        });
      } else {
        await db.merchantCategoryMappings.add({
          id: crypto.randomUUID(),
          merchantKey: key,
          subcategoryID: nextID,
          updatedAt: new Date().toISOString(),
        });
      }

      const sameMerchantTx = await db.transactions
        .filter(
          (t) =>
            t.id !== transaction.id &&
            t.type === "expense" &&
            merchantMatchKey(t.merchant) === key &&
            t.subcategoryID !== nextID
        )
        .toArray();
      await Promise.all(
        sameMerchantTx.map((t) => db.transactions.update(t.id, { subcategoryID: nextID }))
      );
      setAppliedCount(sameMerchantTx.length);
      setTimeout(() => setAppliedCount(null), 3000);
    }
  }

  async function handleExcludeChange(excluded: boolean) {
    if (!transaction) return;
    await db.transactions.update(transaction.id, { excludedFromBudget: excluded });

    const key = merchantMatchKey(transaction.merchant);
    const existing = await db.merchantExclusions.where("merchantKey").equals(key).first();
    if (excluded) {
      if (existing) {
        await db.merchantExclusions.update(existing.id, { updatedAt: new Date().toISOString() });
      } else {
        await db.merchantExclusions.add({
          id: crypto.randomUUID(),
          merchantKey: key,
          updatedAt: new Date().toISOString(),
        });
      }
    } else if (existing) {
      await db.merchantExclusions.delete(existing.id);
    }

    const sameMerchantTx = await db.transactions
      .filter(
        (t) =>
          t.id !== transaction.id &&
          merchantMatchKey(t.merchant) === key &&
          t.excludedFromBudget !== excluded
      )
      .toArray();
    await Promise.all(
      sameMerchantTx.map((t) => db.transactions.update(t.id, { excludedFromBudget: excluded }))
    );
    setExclusionAppliedCount(sameMerchantTx.length);
    setTimeout(() => setExclusionAppliedCount(null), 3000);
  }

  async function handleBonusPaymentChange(isBonusPayment: boolean) {
    if (!transaction) return;
    await db.transactions.update(transaction.id, { isBonusPayment });
  }

  async function handleRecurringChange(nextIsRecurring: boolean) {
    if (!transaction) return;
    const key = merchantMatchKey(transaction.merchant);
    const existing = await db.recurringOverrides.where("merchantKey").equals(key).first();
    if (existing) {
      await db.recurringOverrides.update(existing.id, {
        isRecurring: nextIsRecurring,
        updatedAt: new Date().toISOString(),
      });
    } else {
      await db.recurringOverrides.add({
        id: crypto.randomUUID(),
        merchantKey: key,
        isRecurring: nextIsRecurring,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async function handleDelete() {
    if (!transaction) return;
    if (!confirm("この取引を削除しますか?")) return;
    await db.transactions.delete(transaction.id);
    navigate(-1);
  }

  return (
    <div>
      <button type="button" className="back-link" onClick={() => navigate(-1)}>
        ‹ 戻る
      </button>
      <h1 className="screen-title">取引詳細</h1>

      <div className="form-row">
        <label htmlFor="merchant">店名</label>
        <input
          id="merchant"
          value={currentMerchant}
          onChange={(e) => setMerchant(e.target.value)}
          onBlur={() => saveField({ merchant: currentMerchant })}
        />
      </div>

      <div className="form-row">
        <label htmlFor="date">日付</label>
        <input
          id="date"
          type="date"
          value={transaction.date.slice(0, 10)}
          onChange={(e) => saveField({ date: new Date(e.target.value).toISOString() })}
        />
      </div>

      <div className="form-row">
        <label htmlFor="amount">金額</label>
        <input
          id="amount"
          type="number"
          value={currentAmount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={() => saveField({ amount: Number(currentAmount) })}
        />
      </div>

      {transaction.type === "expense" && (
        <div className="form-row">
          <label>カテゴリ</label>
          <button
            type="button"
            className="btn-secondary category-toggle"
            onClick={() => setPickerOpen((v) => !v)}
          >
            {categoryLabel} {pickerOpen ? "▴" : "▾"}
          </button>

          {pickerOpen && (
            <div className="category-picker">
              <button
                type="button"
                className={`list-row ${transaction.subcategoryID == null ? "selected" : ""}`}
                onClick={() => handleCategoryChange("")}
              >
                未分類
              </button>
              {majorCategories.map((major) => (
                <div className="section" key={major.id}>
                  <div className="section-title">{major.name}</div>
                  <div className="list">
                    {subcategories
                      .filter((s) => s.majorCategoryID === major.id)
                      .map((sub) => (
                        <button
                          key={sub.id}
                          type="button"
                          className={`list-row ${sub.id === transaction.subcategoryID ? "selected" : ""}`}
                          onClick={() => handleCategoryChange(sub.id)}
                        >
                          {sub.name}
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {appliedCount !== null && appliedCount > 0 && (
            <p className="muted">同じ店名の他の取引 {appliedCount}件にも反映しました</p>
          )}
        </div>
      )}

      <div className="form-row">
        <label className="filter-row">
          <input
            type="checkbox"
            checked={!!transaction.excludedFromBudget}
            onChange={(e) => handleExcludeChange(e.target.checked)}
          />
          家計に含めない
        </label>
        {exclusionAppliedCount !== null && exclusionAppliedCount > 0 && (
          <p className="muted">同じ店名の他の取引 {exclusionAppliedCount}件にも反映しました</p>
        )}
      </div>

      {isExpense && (
        <div className="form-row">
          <label className="filter-row">
            <input
              type="checkbox"
              checked={!!transaction.isBonusPayment}
              onChange={(e) => handleBonusPaymentChange(e.target.checked)}
            />
            ボーナス払い
          </label>
        </div>
      )}

      {isExpense && (
        <div className="form-row">
          <label className="filter-row">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => handleRecurringChange(e.target.checked)}
            />
            定常費用(毎月発生)
          </label>
          <p className="muted">
            未設定の場合は履歴(同じ店名で2ヶ月以上発生していれば定常)から自動判定されます
          </p>
        </div>
      )}

      <div className="form-row">
        <label htmlFor="memo">メモ</label>
        <input
          id="memo"
          value={currentMemo}
          onChange={(e) => setMemo(e.target.value)}
          onBlur={() => saveField({ memo: currentMemo === "" ? null : currentMemo })}
        />
      </div>

      <button type="button" className="btn-secondary" onClick={handleDelete}>
        削除
      </button>
    </div>
  );
}
