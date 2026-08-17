import { parseCsvDateCell, splitCsvLine } from "./csvUtils";

/**
 * PayPayカードの「ご利用明細」CSV/貼り付け(利用日/キャンセル日・利用店名・利用金額等の
 * 列構成)を、Claude APIを呼ばずコード側で解析する。
 *
 * 公式請求明細書(PDF)は当月分が確定するまでダウンロードできないが、この利用明細は
 * 会員メニューの利用明細一覧からいつでも取得できるため、当月未確定分の取り込みに使う。
 * 「利用日/キャンセル日」列名の通り、キャンセル(返金)の行は「利用金額」がマイナス値で
 * 記録されるため、そのままマイナスの支出として扱う。
 *
 * 実ファイルの区切り文字が不明(タブ区切りで貼り付けられるケースを確認済み)なため、
 * カンマ・タブの両方を試す。またタイトル行等の前置きがある場合に備え、先頭5行以内から
 * ヘッダー行を探す。
 */
export interface ParsedPayPayCardUsageCsvRow {
  date: string; // "YYYY-MM-DD"
  merchant: string;
  amount: number; // 支出は正、キャンセル(返金)はマイナス
  type: "expense";
}

const DATE_HEADER = "利用日/キャンセル日";
const MERCHANT_HEADER = "利用店名・商品名";
const AMOUNT_HEADER = "利用金額";

const HEADER_SCAN_LIMIT = 5;

interface HeaderMatch {
  delimiter: string;
  lineIndex: number;
  dateIndex: number;
  merchantIndex: number;
  amountIndex: number;
}

function findHeader(lines: string[]): HeaderMatch | null {
  const scanLimit = Math.min(lines.length, HEADER_SCAN_LIMIT);
  for (let i = 0; i < scanLimit; i++) {
    for (const delimiter of [",", "\t"]) {
      const cells = splitCsvLine(lines[i], delimiter);
      const dateIndex = cells.indexOf(DATE_HEADER);
      const merchantIndex = cells.indexOf(MERCHANT_HEADER);
      const amountIndex = cells.indexOf(AMOUNT_HEADER);
      if (dateIndex !== -1 && merchantIndex !== -1 && amountIndex !== -1) {
        return { delimiter, lineIndex: i, dateIndex, merchantIndex, amountIndex };
      }
    }
  }
  return null;
}

export function tryParsePayPayCardUsageCsv(text: string): ParsedPayPayCardUsageCsvRow[] | null {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) return null;

  const header = findHeader(lines);
  if (!header) return null;
  const { delimiter, lineIndex, dateIndex, merchantIndex, amountIndex } = header;
  const maxIndex = Math.max(dateIndex, merchantIndex, amountIndex);

  const rows: ParsedPayPayCardUsageCsvRow[] = [];
  for (const line of lines.slice(lineIndex + 1)) {
    const cells = splitCsvLine(line, delimiter);
    if (cells.length <= maxIndex) continue;

    const date = parseCsvDateCell(cells[dateIndex]);
    const merchant = cells[merchantIndex].trim();
    const amount = Number(cells[amountIndex].replace(/,/g, ""));
    if (!date || !merchant || !Number.isFinite(amount) || amount === 0) continue;

    rows.push({ date, merchant, amount, type: "expense" });
  }

  return rows.length > 0 ? rows : null;
}
