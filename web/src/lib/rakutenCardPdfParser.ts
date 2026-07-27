import type { PDFDocumentProxy } from "pdfjs-dist";
import { getPageItems, loadPdfDocument, type TextItem } from "./pdfjsSetup";

/**
 * 楽天カードの「ご利用代金請求明細書」PDF(楽天e-NAVIからダウンロードした
 * 請求明細)を、Claude APIを呼ばずコード側で解析する。
 *
 * このPDFはPayPayカードの明細と異なり、1取引が1行の平文テキストとして
 * 抽出できる(セルが複数行に折り返されない)。ただし、pdf.jsは単語間の
 * スペースを保持しないことがあるため、隣接する断片のX座標の間隔から
 * 単語境界を復元してから、行を正規表現で解析する。
 *
 * ETCカード利用分の通行区間や海外利用の換算レートなど、取引行の下に
 * 補足行が続くことがあるが、これらは日付から始まらないため自然に無視される。
 *
 * 抽出結果は明細書1ページ目の「ご請求金額」との合計検算に失敗した場合、
 * 誤った金額を家計簿に取り込まないようnullを返す(呼び出し元はClaude APIに
 * フォールバックする)。
 */
export interface ParsedCreditCardPdfRow {
  date: string; // "YYYY-MM-DD"
  merchant: string;
  amount: number; // 支出は正、返金等のキャンセルはマイナス
  type: "expense";
}

/** 同一行とみなすY座標の許容誤差 */
const LINE_Y_TOLERANCE = 3;
/** 単語間にスペースを挿入するX座標の間隔の閾値 */
const WORD_GAP_THRESHOLD = 1.5;

/**
 * 「日付 利用店名 利用者* 支払方法 利用金額 手数料/利息 支払総額 当月支払額 当月請求額 翌月繰越残高」
 * の1行。利用者欄は必ず「*」で終わるため、これを手掛かりに空白を含む
 * 利用店名を貪欲マッチで切り出す。
 */
const ROW_REGEX =
  /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(.+)\s+(\S+\*)\s+(\S+)\s+([\d,-]+)\s+([\d,-]+)\s+([\d,-]+)\s+([\d,-]+)\s+([\d,-]+)\s+([\d,-]+)$/;

const TOTAL_LABEL = "ご請求金額";
/** 「ご請求金額」ラベルと金額欄との想定Y座標差の上限 */
const TOTAL_Y_WINDOW = 20;

function buildLines(items: TextItem[]): string[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextItem[][] = [];
  let current: TextItem[] = [];
  let prevY: number | null = null;
  for (const it of sorted) {
    if (prevY !== null && Math.abs(prevY - it.y) > LINE_Y_TOLERANCE) {
      lines.push(current);
      current = [];
    }
    current.push(it);
    prevY = it.y;
  }
  if (current.length > 0) lines.push(current);

  return lines.map((line) => {
    let text = "";
    let prevEnd: number | null = null;
    for (const it of line) {
      if (prevEnd !== null && it.x - prevEnd > WORD_GAP_THRESHOLD) text += " ";
      text += it.str;
      prevEnd = it.x + it.width;
    }
    return text;
  });
}

function parseAmountCell(raw: string): number | null {
  const normalized = raw.replace(/[－−﹣]/g, "-"); // 全角マイナスをASCIIに統一
  const cleaned = normalized.replace(/[^\d-]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

function parseRowLine(line: string): ParsedCreditCardPdfRow | null {
  const match = line.match(ROW_REGEX);
  if (!match) return null;
  const [, year, month, day, merchant, , , usageAmountRaw] = match;
  const amount = parseAmountCell(usageAmountRaw);
  const trimmedMerchant = merchant.trim();
  if (amount === null || amount === 0 || !trimmedMerchant) return null;

  return {
    date: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
    merchant: trimmedMerchant,
    amount,
    type: "expense",
  };
}

async function extractRows(doc: PDFDocumentProxy): Promise<ParsedCreditCardPdfRow[]> {
  const rows: ParsedCreditCardPdfRow[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const items = await getPageItems(doc, p);
    const lines = buildLines(items);
    for (const line of lines) {
      const row = parseRowLine(line);
      if (row) rows.push(row);
    }
  }
  return rows;
}

/** 明細書1ページ目の「ご請求金額」欄の金額を検算用に取得する(見つからなければnull) */
async function extractDeclaredTotal(doc: PDFDocumentProxy): Promise<number | null> {
  const items = await getPageItems(doc, 1);
  for (const label of items) {
    if (!label.str.includes(TOTAL_LABEL)) continue;
    const nearby = items.find(
      (it) =>
        it.y < label.y &&
        label.y - it.y < TOTAL_Y_WINDOW &&
        /^[\d,]+円$/.test(it.str.trim())
    );
    if (nearby) {
      const amount = parseAmountCell(nearby.str);
      if (amount !== null) return amount;
    }
  }
  return null;
}

/** @param base64Pdf `readFileForExtraction`が返すbase64文字列(FileForExtraction.data) */
export async function tryParseRakutenCardPdf(
  base64Pdf: string
): Promise<ParsedCreditCardPdfRow[] | null> {
  const doc = await loadPdfDocument(base64Pdf);
  if (!doc) return null;

  const rows = await extractRows(doc);
  if (rows.length === 0) return null;

  const declaredTotal = await extractDeclaredTotal(doc);
  if (declaredTotal !== null) {
    const sum = rows.reduce((total, row) => total + row.amount, 0);
    if (sum !== declaredTotal) return null;
  }

  return rows;
}
