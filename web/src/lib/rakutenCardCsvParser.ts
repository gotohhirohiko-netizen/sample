import { parseCsvDateCell, splitCsvLine } from "./csvUtils";

/**
 * 楽天カード(e-NAVI)の「ご利用明細」CSVを解析する。当月分がまだ確定して
 * おらずPDF明細書がダウンロードできない場合でも、e-NAVIの明細一覧は
 * CSVでダウンロードできることがあり、そちらを対象とする。
 *
 * このCSVには「当月請求額」列があり、ご利用キャンセル等があった場合は
 * 「利用金額」より少ない(またはキャンセルされた分は0円の)ネット金額が
 * 入っている。ファイル末尾の「■ご利用キャンセルなど」セクションは
 * この当月請求額に既に反映済みの内訳情報のため、パース対象には含めない
 * (該当行は当月請求額が空欄になっており、自然に除外される)。
 *
 * 利用店名・商品名列には「ＶＩＳＡ国内利用　VS ○○」のようにカード
 * ブランド・処理区分のプレフィックスが付くことがあり、これを取り除かないと
 * 同じ店名でも公式PDF明細書側の店名表記と一致せず、重複判定・カテゴリ学習が
 * すり抜ける。プレフィックスを取り除いてから店名として使う。
 */
export interface ParsedRakutenCardCsvRow {
  date: string; // "YYYY-MM-DD"
  merchant: string;
  amount: number; // 支出は正
  type: "expense";
}

const DATE_HEADER = "利用日";
const MERCHANT_HEADER = "利用店名・商品名";
const BILLED_AMOUNT_HEADER = "当月請求額";

const BRAND_PREFIX = /^(?:ＶＩＳＡ|ＪＣＢ)(?:国内|海外)利用[　\s]+(?:[A-Z]{1,3}[　\s]+)?/;

function stripBrandPrefix(merchant: string): string {
  return merchant.replace(BRAND_PREFIX, "").trim();
}

function detectDelimiter(headerLine: string): string | null {
  for (const delimiter of [",", "\t"]) {
    const cells = splitCsvLine(headerLine, delimiter);
    if (
      cells.includes(DATE_HEADER) &&
      cells.includes(MERCHANT_HEADER) &&
      cells.includes(BILLED_AMOUNT_HEADER)
    ) {
      return delimiter;
    }
  }
  return null;
}

export function tryParseRakutenCardCsv(text: string): ParsedRakutenCardCsvRow[] | null {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) return null;

  const delimiter = detectDelimiter(lines[0]);
  if (!delimiter) return null;

  const headerCells = splitCsvLine(lines[0], delimiter);
  const dateIndex = headerCells.indexOf(DATE_HEADER);
  const merchantIndex = headerCells.indexOf(MERCHANT_HEADER);
  const billedAmountIndex = headerCells.indexOf(BILLED_AMOUNT_HEADER);
  const maxIndex = Math.max(dateIndex, merchantIndex, billedAmountIndex);

  const rows: ParsedRakutenCardCsvRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line, delimiter);
    if (cells.length <= maxIndex) continue;

    const date = parseCsvDateCell(cells[dateIndex]);
    const merchant = stripBrandPrefix(cells[merchantIndex]);
    const amount = Number(cells[billedAmountIndex].replace(/,/g, ""));
    if (!date || !merchant || !Number.isFinite(amount) || amount <= 0) continue;

    rows.push({ date, merchant, amount, type: "expense" });
  }

  return rows.length > 0 ? rows : null;
}
