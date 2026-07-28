import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { bonusPeriodRange, bonusUncoveredTransactions } from "../lib/bonusCalculator";
import { formatYen } from "../lib/dateUtils";
import TransactionRow from "../components/TransactionRow";
import type { Transaction } from "../types/models";

interface Group {
  key: string;
  label: string;
  majorCategoryID: string | null;
  subcategoryID: string | null;
  items: Transaction[];
  total: number;
}

/**
 * ボーナス予実画面の「その他」ドリルダウン。どの使用計画にも割り当てられて
 * いないボーナス払いをカテゴリごとにまとめ、内訳への追加やカテゴリ変更への
 * 導線を提供する
 */
export default function BonusOtherView() {
  const { periodId, year: yearParam } = useParams<{ periodId: string; year: string }>();
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

  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

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
  if (!period) {
    return (
      <div>
        <p className="muted">ボーナス計画が見つかりません。</p>
        <Link to="/" className="back-link">
          ‹ ホームへ戻る
        </Link>
      </div>
    );
  }

  const { start, end } = bonusPeriodRange(period, year);
  const plans = bonusCategoryPlans.filter((p) => p.bonusPeriodID === period.id && p.year === year);
  const otherItems = bonusUncoveredTransactions(start, end, transactions, plans, subcategories);
  const otherTotal = otherItems.reduce((sum, t) => sum + t.amount, 0);

  const groups = new Map<string, Group>();
  for (const t of otherItems) {
    const key = t.subcategoryID ?? "__uncategorized__";
    let group = groups.get(key);
    if (!group) {
      const sub = t.subcategoryID ? subcategories.find((s) => s.id === t.subcategoryID) : undefined;
      const major = sub ? majorCategories.find((m) => m.id === sub.majorCategoryID) : undefined;
      const label = sub ? (major ? `${major.name} / ${sub.name}` : sub.name) : "未分類";
      group = {
        key,
        label,
        majorCategoryID: sub?.majorCategoryID ?? null,
        subcategoryID: t.subcategoryID,
        items: [],
        total: 0,
      };
      groups.set(key, group);
    }
    group.items.push(t);
    group.total += t.amount;
  }
  const groupList = Array.from(groups.values()).sort((a, b) => b.total - a.total);

  async function addToPlan(group: Group) {
    if (!group.subcategoryID || !group.majorCategoryID) return;
    const amountStr = amounts[group.key] ?? String(group.total);
    const amount = Number(amountStr);
    if (!Number.isFinite(amount) || amount <= 0) return;

    await db.bonusCategoryPlans.add({
      id: crypto.randomUUID(),
      bonusPeriodID: period!.id,
      year,
      majorCategoryID: group.majorCategoryID,
      subcategoryID: group.subcategoryID,
      plannedAmount: amount,
    });
    setMessage(`「${group.label}」を内訳に追加しました`);
    setTimeout(() => setMessage(null), 2500);
  }

  return (
    <div>
      <Link to={`/bonus-actual/${period.id}/${year}`} className="back-link">
        ‹ ボーナス予実へ戻る
      </Link>
      <h1 className="screen-title">その他</h1>
      <p className="muted">割り当てのないボーナス払い: {formatYen(otherTotal)}</p>
      {message && <p className="muted">{message}</p>}

      {groupList.map((group) => (
        <div key={group.key} className="section card">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <strong>{group.label}</strong>
            <span className="amount">{formatYen(group.total)}</span>
          </div>

          <div className="list" style={{ marginTop: 8 }}>
            {group.items
              .slice()
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((tx) => (
                <TransactionRow
                  key={tx.id}
                  transaction={tx}
                  fundingSources={fundingSources}
                  subcategories={subcategories}
                  majorCategories={majorCategories}
                />
              ))}
          </div>

          {group.subcategoryID ? (
            <div className="button-row" style={{ marginTop: 8 }}>
              <input
                type="number"
                value={amounts[group.key] ?? String(group.total)}
                onChange={(e) => setAmounts((prev) => ({ ...prev, [group.key]: e.target.value }))}
                placeholder="計画額"
              />
              <button type="button" className="btn-primary" onClick={() => addToPlan(group)}>
                ボーナスの内訳に追加
              </button>
            </div>
          ) : (
            <p className="muted" style={{ marginTop: 8 }}>
              カテゴリ未設定のため内訳に追加できません。取引をタップしてカテゴリを設定してください。
            </p>
          )}
        </div>
      ))}
      {groupList.length === 0 && <p className="muted">割り当てのないボーナス払いはありません</p>}
    </div>
  );
}
