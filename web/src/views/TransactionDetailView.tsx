import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
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

  const [merchant, setMerchant] = useState<string | null>(null);
  const [amount, setAmount] = useState<string | null>(null);
  const [memo, setMemo] = useState<string | null>(null);

  if (!transaction || !majorCategories || !subcategories) {
    return <p className="muted">読み込み中...</p>;
  }

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

    if (nextID) {
      const existing = await db.merchantCategoryMappings
        .where("merchantKey")
        .equals(transaction.merchant)
        .first();
      if (existing) {
        await db.merchantCategoryMappings.update(existing.id, {
          subcategoryID: nextID,
          updatedAt: new Date().toISOString(),
        });
      } else {
        await db.merchantCategoryMappings.add({
          id: crypto.randomUUID(),
          merchantKey: transaction.merchant,
          subcategoryID: nextID,
          updatedAt: new Date().toISOString(),
        });
      }
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
      <Link to="/" className="back-link">
        ‹ 戻る
      </Link>
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
          <label htmlFor="category">カテゴリ</label>
          <select
            id="category"
            value={transaction.subcategoryID ?? ""}
            onChange={(e) => handleCategoryChange(e.target.value)}
          >
            <option value="">未分類</option>
            {majorCategories.map((major) => (
              <optgroup key={major.id} label={major.name}>
                {subcategories
                  .filter((s) => s.majorCategoryID === major.id)
                  .map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
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
