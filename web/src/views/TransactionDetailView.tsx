import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import {
  hasDivergentCategoryHistory,
  isMerchantAmbiguous,
  merchantMatchKey,
} from "../lib/categoryResolver";
import { isEligibleForMonthlyRecurring, resolveRecurringType } from "../lib/recurringResolver";
import type { RecurringOverrideType, Transaction } from "../types/models";

const RECURRING_OVERRIDE_TYPE_LABELS: Record<RecurringOverrideType, string> = {
  monthly: "毎月定常",
  specific: "該当月定常",
};

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
  const ambiguousFlags = useLiveQuery(() => db.merchantAmbiguousFlags.toArray(), []);

  const [merchant, setMerchant] = useState<string | null>(null);
  const [amount, setAmount] = useState<string | null>(null);
  const [memo, setMemo] = useState<string | null>(null);
  const [appliedCount, setAppliedCount] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exclusionAppliedCount, setExclusionAppliedCount] = useState<number | null>(null);

  if (
    !transaction ||
    !majorCategories ||
    !subcategories ||
    !allTransactions ||
    !recurringOverrides ||
    !ambiguousFlags
  ) {
    return <p className="muted">読み込み中...</p>;
  }

  const isExpense = transaction.type === "expense";
  const isIncome = transaction.type === "income";
  const recurringType = resolveRecurringType(transaction.merchant, recurringOverrides);
  const merchantKey = merchantMatchKey(transaction.merchant);
  const monthlyEligible = isEligibleForMonthlyRecurring(transaction.merchant, allTransactions);

  const currentSubcategory = subcategories.find((s) => s.id === transaction.subcategoryID);
  const currentMajorCategory = currentSubcategory
    ? majorCategories.find((m) => m.id === currentSubcategory.majorCategoryID)
    : undefined;
  const categoryLabel = currentSubcategory
    ? currentMajorCategory
      ? `${currentMajorCategory.name} / ${currentSubcategory.name}`
      : currentSubcategory.name
    : "未分類";
  const isAmbiguousMerchant = isMerchantAmbiguous(transaction.merchant, ambiguousFlags);

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

    if (!nextID) return;

    const key = merchantMatchKey(transaction.merchant);
    const divergent = hasDivergentCategoryHistory(
      transaction.merchant,
      nextID,
      allTransactions!,
      transaction.id
    );

    if (divergent && !isAmbiguousMerchant) {
      // 同じ店名で異なるカテゴリが設定された履歴があるため、以後この店名は
      // 自動学習・一括反映の対象外にする(例: Yahoo!ショッピング等)
      await db.merchantAmbiguousFlags.add({
        id: crypto.randomUUID(),
        merchantKey: key,
        updatedAt: new Date().toISOString(),
      });
    }

    if (divergent || isAmbiguousMerchant) return;

    const existing = await db.merchantCategoryMappings.where("merchantKey").equals(key).first();
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

  async function handleAmbiguousChange(ambiguous: boolean) {
    if (!transaction) return;
    const key = merchantMatchKey(transaction.merchant);
    const existing = await db.merchantAmbiguousFlags.where("merchantKey").equals(key).first();
    if (ambiguous) {
      if (!existing) {
        await db.merchantAmbiguousFlags.add({
          id: crypto.randomUUID(),
          merchantKey: key,
          updatedAt: new Date().toISOString(),
        });
      }
    } else if (existing) {
      await db.merchantAmbiguousFlags.delete(existing.id);
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

  async function handleTypeChange(nextType: Transaction["type"]) {
    if (!transaction || nextType === transaction.type) return;
    const patch: Partial<Transaction> =
      nextType === "income"
        ? { type: nextType, subcategoryID: null, isBonusPayment: false }
        : { type: nextType, isBonusIncome: false };
    await db.transactions.update(transaction.id, patch);
  }

  async function handleBonusPaymentChange(isBonusPayment: boolean) {
    if (!transaction) return;
    await db.transactions.update(transaction.id, { isBonusPayment });
  }

  async function handleBonusIncomeChange(isBonusIncome: boolean) {
    if (!transaction) return;
    await db.transactions.update(transaction.id, { isBonusIncome });
  }

  async function handleRecurringTypeChange(nextType: RecurringOverrideType) {
    if (!transaction) return;
    const existing = await db.recurringOverrides.where("merchantKey").equals(merchantKey).first();
    if (recurringType === nextType) {
      // 選択中のボタンを再度押した場合は設定を解除し、既定(突発/比例費用)に戻す
      if (existing) await db.recurringOverrides.delete(existing.id);
      return;
    }
    if (existing) {
      await db.recurringOverrides.update(existing.id, {
        type: nextType,
        updatedAt: new Date().toISOString(),
      });
    } else {
      await db.recurringOverrides.add({
        id: crypto.randomUUID(),
        merchantKey,
        type: nextType,
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

      <div className="form-row">
        <label>収入・支出</label>
        <div className="button-row">
          <button
            type="button"
            className={isExpense ? "btn-primary" : "btn-secondary"}
            onClick={() => handleTypeChange("expense")}
          >
            支出
          </button>
          <button
            type="button"
            className={isIncome ? "btn-primary" : "btn-secondary"}
            onClick={() => handleTypeChange("income")}
          >
            収入
          </button>
        </div>
        <p className="muted">
          取り込み時の解析結果が誤っている場合(例: 銀行明細の符号の読み違え)は、ここで修正できます
        </p>
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

          <label className="filter-row">
            <input
              type="checkbox"
              checked={isAmbiguousMerchant}
              onChange={(e) => handleAmbiguousChange(e.target.checked)}
            />
            この店名はカテゴリが一意に決まらない
          </label>
          <p className="muted">
            ONにすると、この店名は次回以降の自動カテゴリ判定や、同じ店名の他の取引への一括反映の対象外になります(例:
            Yahoo!ショッピングのように何を買うかでカテゴリが変わる店)。同じ店名で異なるカテゴリが設定された履歴を検知すると自動的にONになります。
          </p>
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
          <label>定常費用の区分</label>
          <div className="button-row">
            {(["monthly", "specific"] as RecurringOverrideType[]).map((type) => {
              const disabled = type === "monthly" && recurringType !== "monthly" && !monthlyEligible;
              return (
                <button
                  key={type}
                  type="button"
                  className={recurringType === type ? "btn-primary" : "btn-secondary"}
                  disabled={disabled}
                  onClick={() => handleRecurringTypeChange(type)}
                >
                  {RECURRING_OVERRIDE_TYPE_LABELS[type]}
                </button>
              );
            })}
          </div>
          <p className="muted">
            未設定の店名は比例費用(突発)として扱われます。自動判定は行わないため、電気代等の固定費のみ手動で設定してください。
            選択中のボタンをもう一度押すと設定を解除できます。
            毎月定常は、2ヶ月以上の履歴がありかつ各月1回のみ発生している店名にのみ設定できます
            (日用品や食品店のように同じ月に複数回発生する店名は、金額固定の定常費用ではないため対象外です)。
            該当月定常を選んだ店名は、ホーム画面の「当月の計画・予算調整」から発生する月ごとに金額を登録できます。
          </p>
        </div>
      )}

      {isIncome && (
        <div className="form-row">
          <label className="filter-row">
            <input
              type="checkbox"
              checked={!!transaction.isBonusIncome}
              onChange={(e) => handleBonusIncomeChange(e.target.checked)}
            />
            ボーナス収入(賞与等)
          </label>
          <p className="muted">
            ONにすると月次サマリーの収入集計から除外されます。振込名称からは自動判別できないため手動設定です
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
