import { parseCsvDateCell, splitCsvLine } from "./csvUtils";

/**
 * PayPayアプリの「取引履歴」CSV(Transactions_YYYYMMDDYYYYMMDD.csv)を解析する。
 * PayPayカードの公式請求明細書は当月分が確定するまでダウンロードできないが、
 * PayPayアプリ自体の取引履歴はいつでもCSVでエクスポートできるため、
 * 当月未確定分の取り込みに使う。
 *
 * このCSVには「支払い」(実際の購入)と「ポイント、残高の獲得」(ポイント還元等)の
 * 両方が記録されているが、後者は実際の支出ではないため対象外とする。
 *
 * 「取引方法」列には、PayPay残高/ポイントとクレジットカードを併用した場合、
 * 「PayPayポイント (268円), クレジット Mastercard 3476 (5,797円)」のように
 * 内訳が記載される。確定後の公式請求明細書にはクレジットカードで実際に
 * 決済された分しか載らないため、後日の重複判定・金額の整合性のため、
 * 「出金金額」全体ではなくクレジットカード決済分のみを金額として扱う
 * (PayPay残高/ポイントのみの支払いはカード決済分0円のため対象外)。
 */
export interface ParsedPayPayTransactionCsvRow {
  date: string; // "YYYY-MM-DD"
  merchant: string;
  amount: number; // クレジットカード決済分(支出)
  type: "expense";
}

const DATE_HEADER = "取引日";
const WITHDRAWAL_HEADER = "出金金額（円）";
const CONTENT_HEADER = "取引内容";
const MERCHANT_HEADER = "取引先";
const PAYMENT_METHOD_HEADER = "取引方法";

const PAYMENT_CONTENT_VALUE = "支払い";

/** 「クレジット Mastercard 3476 (5,797円)」のような内訳表記からカード決済分の金額を取り出す */
const CREDIT_BREAKDOWN_REGEX = /クレジット[^,()]*\(([\d,]+)円\)/;

function extractCreditAmount(paymentMethodRaw: string, withdrawalAmount: number): number {
  const breakdownMatch = paymentMethodRaw.match(CREDIT_BREAKDOWN_REGEX);
  if (breakdownMatch) {
    return Number(breakdownMatch[1].replace(/,/g, ""));
  }
  if (paymentMethodRaw.includes("クレジット")) {
    return withdrawalAmount;
  }
  return 0; // PayPay残高/ポイントのみの支払い
}

function detectDelimiter(headerLine: string): string | null {
  for (const delimiter of [",", "\t"]) {
    const cells = splitCsvLine(headerLine, delimiter);
    if (
      cells.includes(DATE_HEADER) &&
      cells.includes(WITHDRAWAL_HEADER) &&
      cells.includes(CONTENT_HEADER) &&
      cells.includes(MERCHANT_HEADER) &&
      cells.includes(PAYMENT_METHOD_HEADER)
    ) {
      return delimiter;
    }
  }
  return null;
}

export function tryParsePayPayTransactionCsv(text: string): ParsedPayPayTransactionCsvRow[] | null {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) return null;

  const delimiter = detectDelimiter(lines[0]);
  if (!delimiter) return null;

  const headerCells = splitCsvLine(lines[0], delimiter);
  const dateIndex = headerCells.indexOf(DATE_HEADER);
  const withdrawalIndex = headerCells.indexOf(WITHDRAWAL_HEADER);
  const contentIndex = headerCells.indexOf(CONTENT_HEADER);
  const merchantIndex = headerCells.indexOf(MERCHANT_HEADER);
  const paymentMethodIndex = headerCells.indexOf(PAYMENT_METHOD_HEADER);
  const maxIndex = Math.max(dateIndex, withdrawalIndex, contentIndex, merchantIndex, paymentMethodIndex);

  const rows: ParsedPayPayTransactionCsvRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line, delimiter);
    if (cells.length <= maxIndex) continue;
    if (cells[contentIndex] !== PAYMENT_CONTENT_VALUE) continue; // ポイント獲得等は対象外

    const dateRaw = cells[dateIndex].split(" ")[0]; // "2026/07/28 13:35:16" -> "2026/07/28"
    const date = parseCsvDateCell(dateRaw);
    const merchant = cells[merchantIndex];
    const withdrawalAmount = Number(cells[withdrawalIndex].replace(/,/g, ""));
    if (!date || !merchant || !Number.isFinite(withdrawalAmount)) continue;

    const amount = extractCreditAmount(cells[paymentMethodIndex], withdrawalAmount);
    if (amount <= 0) continue;

    rows.push({ date, merchant, amount, type: "expense" });
  }

  return rows.length > 0 ? rows : null;
}
