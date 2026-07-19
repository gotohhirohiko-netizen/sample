import { Link } from "react-router-dom";
import type { FundingSource, MajorCategory, Subcategory, Transaction } from "../types/models";
import { formatYen } from "../lib/dateUtils";

interface Props {
  transaction: Transaction;
  fundingSources: FundingSource[];
  subcategories?: Subcategory[];
  majorCategories?: MajorCategory[];
  isSpontaneous?: boolean;
}

/** 日次収支リスト等で使う取引1行の表示(要件定義書 4.4) */
export default function TransactionRow({
  transaction,
  fundingSources,
  subcategories,
  majorCategories,
  isSpontaneous,
}: Props) {
  const sourceName =
    fundingSources.find((s) => s.id === transaction.sourceInstitutionID)?.displayName ?? "不明";

  const subcategory = subcategories?.find((s) => s.id === transaction.subcategoryID);
  const majorCategory = subcategory
    ? majorCategories?.find((m) => m.id === subcategory.majorCategoryID)
    : undefined;
  const categoryLabel = subcategory
    ? majorCategory
      ? `${majorCategory.name} / ${subcategory.name}`
      : subcategory.name
    : "未分類";

  const showSpontaneous = transaction.type === "expense" && isSpontaneous;

  const isBonus = transaction.isBonusPayment || transaction.isBonusIncome;

  return (
    <Link
      to={`/transactions/${transaction.id}`}
      className={`list-row ${isBonus ? "bonus-payment" : ""} ${showSpontaneous ? "spontaneous-expense" : ""}`}
      style={transaction.excludedFromBudget ? { opacity: 0.5 } : undefined}
    >
      <div>
        <div>
          {transaction.merchant}
          {transaction.excludedFromBudget && <span className="muted"> (家計対象外)</span>}
          {transaction.isBonusPayment && <span className="bonus-label"> (ボーナス払い)</span>}
          {transaction.isBonusIncome && <span className="bonus-label"> (ボーナス収入)</span>}
          {showSpontaneous && <span className="spontaneous-label"> (突発)</span>}
        </div>
        <div className="muted">
          {sourceName}
          {transaction.type === "expense" && ` ・ ${categoryLabel}`}
        </div>
      </div>
      <div className={`amount ${transaction.type === "income" ? "income" : ""}`}>
        {transaction.type === "income" ? "+" : ""}
        {formatYen(transaction.amount)}
      </div>
    </Link>
  );
}
