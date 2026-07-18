import { Link } from "react-router-dom";
import type { FundingSource, Transaction } from "../types/models";
import { formatYen } from "../lib/dateUtils";

interface Props {
  transaction: Transaction;
  fundingSources: FundingSource[];
}

/** 日次収支リスト等で使う取引1行の表示(要件定義書 4.4) */
export default function TransactionRow({ transaction, fundingSources }: Props) {
  const sourceName =
    fundingSources.find((s) => s.id === transaction.sourceInstitutionID)?.displayName ?? "不明";

  return (
    <Link to={`/transactions/${transaction.id}`} className="list-row">
      <div>
        <div>{transaction.merchant}</div>
        <div className="muted">{sourceName}</div>
      </div>
      <div className={`amount ${transaction.type === "income" ? "income" : ""}`}>
        {transaction.type === "income" ? "+" : ""}
        {formatYen(transaction.amount)}
      </div>
    </Link>
  );
}
