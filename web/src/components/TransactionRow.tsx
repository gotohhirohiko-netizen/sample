import { Link } from "react-router-dom";
import type { FundingSource, MajorCategory, Subcategory, Transaction } from "../types/models";
import { formatYen } from "../lib/dateUtils";

interface Props {
  transaction: Transaction;
  fundingSources: FundingSource[];
  subcategories?: Subcategory[];
  majorCategories?: MajorCategory[];
}

/** 日次収支リスト等で使う取引1行の表示(要件定義書 4.4) */
export default function TransactionRow({
  transaction,
  fundingSources,
  subcategories,
  majorCategories,
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

  return (
    <Link to={`/transactions/${transaction.id}`} className="list-row">
      <div>
        <div>{transaction.merchant}</div>
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
