/**
 * 銀行口座CSVの2つの列構成を判定・解析する。AIによる符号の読み違えを防ぐため、
 * 列構成が一致する場合はコード側で機械的に金額からtype(収入/支出)を判定する。
 * どちらの形式にも一致しない場合はnullを返し、Claudeによる解析にフォールバックする。
 *
 * 1. 符号付き1列形式(楽天銀行の入出金明細等): 「入出金」列の符号(プラス/マイナス)で判定
 * 2. 支払い/預かり分離2列形式(三菱UFJ銀行の入出金明細等): 値がある方の列で判定
 *    (1行につきどちらか一方にのみ値が入っている想定)
 */
import { parseCsvDateCell, splitCsvLine } from "./csvUtils";

export interface ParsedBankCsvRow {
  date: string; // "YYYY-MM-DD"
  merchant: string;
  amount: number; // 絶対値
  type: "income" | "expense";
}

const DATE_HEADER_NAMES = ["取引日", "日付"];
const AMOUNT_HEADER_NAMES = ["入出金(円)", "入出金", "入出金金額(円)", "入出金金額"];
const DESCRIPTION_HEADER_NAMES = ["入出金内容", "摘要", "摘要内容", "内容"];
const WITHDRAWAL_HEADER_NAMES = ["支払い金額", "支払金額", "お支払い金額", "出金金額"];
const DEPOSIT_HEADER_NAMES = ["預かり金額", "預り金額", "お預り金額", "入金金額"];
const SUMMARY_HEADER_NAMES = ["摘要"];
const SUMMARY_DETAIL_HEADER_NAMES = ["摘要内容"];

function detectDelimiter(headerLine: string): string | null {
  for (const delimiter of [",", "\t"]) {
    const cells = splitCsvLine(headerLine, delimiter);
    if (
      cells.some((c) => DATE_HEADER_NAMES.includes(c)) &&
      cells.some((c) => AMOUNT_HEADER_NAMES.includes(c))
    ) {
      return delimiter;
    }
  }
  return null;
}

function detectSeparateColumnDelimiter(headerLine: string): string | null {
  for (const delimiter of [",", "\t"]) {
    const cells = splitCsvLine(headerLine, delimiter);
    if (
      cells.some((c) => DATE_HEADER_NAMES.includes(c)) &&
      cells.some((c) => WITHDRAWAL_HEADER_NAMES.includes(c)) &&
      cells.some((c) => DEPOSIT_HEADER_NAMES.includes(c))
    ) {
      return delimiter;
    }
  }
  return null;
}

export function tryParseSignedAmountBankCsv(text: string): ParsedBankCsvRow[] | null {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) return null;

  const delimiter = detectDelimiter(lines[0]);
  if (!delimiter) return null;

  const headerCells = splitCsvLine(lines[0], delimiter);
  const dateIndex = headerCells.findIndex((c) => DATE_HEADER_NAMES.includes(c));
  const amountIndex = headerCells.findIndex((c) => AMOUNT_HEADER_NAMES.includes(c));
  const descriptionIndex = headerCells.findIndex((c) => DESCRIPTION_HEADER_NAMES.includes(c));
  if (dateIndex === -1 || amountIndex === -1 || descriptionIndex === -1) return null;

  const rows: ParsedBankCsvRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line, delimiter);
    if (cells.length <= Math.max(dateIndex, amountIndex, descriptionIndex)) continue;

    const date = parseCsvDateCell(cells[dateIndex]);
    const amountRaw = Number(cells[amountIndex].replace(/,/g, ""));
    const merchant = cells[descriptionIndex];
    if (!date || !Number.isFinite(amountRaw) || amountRaw === 0 || !merchant) continue;

    rows.push({
      date,
      merchant,
      amount: Math.abs(amountRaw),
      type: amountRaw > 0 ? "income" : "expense",
    });
  }

  return rows.length > 0 ? rows : null;
}

export function tryParseSeparateColumnBankCsv(text: string): ParsedBankCsvRow[] | null {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) return null;

  const delimiter = detectSeparateColumnDelimiter(lines[0]);
  if (!delimiter) return null;

  const headerCells = splitCsvLine(lines[0], delimiter);
  const dateIndex = headerCells.findIndex((c) => DATE_HEADER_NAMES.includes(c));
  const withdrawalIndex = headerCells.findIndex((c) => WITHDRAWAL_HEADER_NAMES.includes(c));
  const depositIndex = headerCells.findIndex((c) => DEPOSIT_HEADER_NAMES.includes(c));
  const summaryIndex = headerCells.findIndex((c) => SUMMARY_HEADER_NAMES.includes(c));
  const summaryDetailIndex = headerCells.findIndex((c) => SUMMARY_DETAIL_HEADER_NAMES.includes(c));
  if (dateIndex === -1 || withdrawalIndex === -1 || depositIndex === -1) return null;
  if (summaryIndex === -1 && summaryDetailIndex === -1) return null;

  const requiredIndexes = [dateIndex, withdrawalIndex, depositIndex, summaryIndex, summaryDetailIndex].filter(
    (i) => i !== -1
  );
  const maxIndex = Math.max(...requiredIndexes);

  const rows: ParsedBankCsvRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line, delimiter);
    if (cells.length <= maxIndex) continue;

    const date = parseCsvDateCell(cells[dateIndex]);
    const detail = summaryDetailIndex === -1 ? "" : cells[summaryDetailIndex];
    const summary = summaryIndex === -1 ? "" : cells[summaryIndex];
    const merchant = detail !== "" ? detail : summary;
    if (!date || !merchant) continue;

    const withdrawalRaw = cells[withdrawalIndex];
    const depositRaw = cells[depositIndex];
    const hasWithdrawal = withdrawalRaw !== "";
    const hasDeposit = depositRaw !== "";
    if (hasWithdrawal === hasDeposit) continue; // 両方空欄/両方値ありは判定不能としてスキップ

    const amountRaw = Number((hasWithdrawal ? withdrawalRaw : depositRaw).replace(/,/g, ""));
    if (!Number.isFinite(amountRaw) || amountRaw <= 0) continue;

    rows.push({ date, merchant, amount: amountRaw, type: hasWithdrawal ? "expense" : "income" });
  }

  return rows.length > 0 ? rows : null;
}
