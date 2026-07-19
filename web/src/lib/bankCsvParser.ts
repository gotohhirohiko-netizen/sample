/**
 * 「取引日・符号付き入出金額・入出金内容」の3列を持つ銀行口座CSV
 * (楽天銀行の入出金明細等)を判定・解析する。AIによる符号の読み違えを防ぐため、
 * 列構成が一致する場合はコード側で機械的に金額の符号からtype(収入/支出)を判定する。
 * 列構成が一致しない場合はnullを返し、Claudeによる解析にフォールバックする。
 */
export interface ParsedBankCsvRow {
  date: string; // "YYYY-MM-DD"
  merchant: string;
  amount: number; // 絶対値
  type: "income" | "expense";
}

const DATE_HEADER_NAMES = ["取引日", "日付"];
const AMOUNT_HEADER_NAMES = ["入出金(円)", "入出金", "入出金金額(円)", "入出金金額"];
const DESCRIPTION_HEADER_NAMES = ["入出金内容", "摘要", "摘要内容", "内容"];

function splitLine(line: string, delimiter: string): string[] {
  return line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

function detectDelimiter(headerLine: string): string | null {
  for (const delimiter of [",", "\t"]) {
    const cells = splitLine(headerLine, delimiter);
    if (
      cells.some((c) => DATE_HEADER_NAMES.includes(c)) &&
      cells.some((c) => AMOUNT_HEADER_NAMES.includes(c))
    ) {
      return delimiter;
    }
  }
  return null;
}

function parseDateCell(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length !== 8) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

export function tryParseSignedAmountBankCsv(text: string): ParsedBankCsvRow[] | null {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) return null;

  const delimiter = detectDelimiter(lines[0]);
  if (!delimiter) return null;

  const headerCells = splitLine(lines[0], delimiter);
  const dateIndex = headerCells.findIndex((c) => DATE_HEADER_NAMES.includes(c));
  const amountIndex = headerCells.findIndex((c) => AMOUNT_HEADER_NAMES.includes(c));
  const descriptionIndex = headerCells.findIndex((c) => DESCRIPTION_HEADER_NAMES.includes(c));
  if (dateIndex === -1 || amountIndex === -1 || descriptionIndex === -1) return null;

  const rows: ParsedBankCsvRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitLine(line, delimiter);
    if (cells.length <= Math.max(dateIndex, amountIndex, descriptionIndex)) continue;

    const date = parseDateCell(cells[dateIndex]);
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
