import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";

/**
 * PayPayカードの「ご利用代金請求明細書」PDF(会員メニューからダウンロードした
 * 請求明細)を、Claude APIを呼ばずコード側で解析する。
 *
 * このPDFはテキストが罫線で区切られた表になっているが、pdf.jsの
 * getTextContent()はセル単位ではなく座標付きの断片(1〜3行に折り返された
 * セル内容)を返すため、列の座標範囲でバケット分けし、Y座標の近さで
 * 行としてクラスタリングして復元する。列の座標(COLUMNS)はこのテンプレート
 * 固有の値であり、PayPayカード側のレイアウト変更で崩れる可能性がある。
 *
 * 1行の内容(特に日付)がページをまたいで分割されることがあるため、
 * 「日付の年月まではあるが日が無い」不完全なクラスタを次ページの続きと
 * 結合して補完する。ページ下部のURL・ページ番号フッターも日付列と同じ
 * X座標帯に現れるため、Y座標で除外してから処理する。
 *
 * 抽出結果は明細書に記載の「ご請求金額」との合計検算に失敗した場合、
 * 誤った金額を家計簿に取り込まないようnullを返す(呼び出し元はClaude APIに
 * フォールバックする)。
 */
export interface ParsedCreditCardPdfRow {
  date: string; // "YYYY-MM-DD"
  merchant: string;
  amount: number; // 支出は正、返金等のキャンセルはマイナス
  type: "expense";
}

interface TextItem {
  x: number;
  y: number;
  str: string;
}

const COLUMNS = [
  { key: "date", xMax: 82 },
  { key: "merchant", xMax: 139 },
  { key: "person", xMax: 185 },
  { key: "paymentMethod", xMax: 241 },
  { key: "installment", xMax: 271 },
  { key: "usageAmount", xMax: 334 },
  { key: "fee", xMax: 364 },
  { key: "totalPayment", xMax: 414 },
  { key: "thisMonthPayment", xMax: 467 },
  { key: "nextMonthPayment", xMax: 503 },
  { key: "carryoverBalance", xMax: Infinity },
] as const;

const REQUIRED_KEYS = COLUMNS.map((c) => c.key);

/** ページ下部のURL・タイムスタンプ・ページ番号フッターの帯(Y座標)を除外する */
const FOOTER_Y_CUTOFF = 60;
/** 同一セル内で折り返された行同士のY座標の間隔の目安値。これを超えたら別の行とみなす */
const GAP_THRESHOLD = 18;

function columnFor(x: number): string {
  for (const c of COLUMNS) {
    if (x < c.xMax) return c.key;
  }
  return COLUMNS[COLUMNS.length - 1].key;
}

function buildCols(items: TextItem[]): Record<string, string> {
  const cols: Record<string, string> = {};
  for (const it of items) {
    const key = columnFor(it.x);
    cols[key] = (cols[key] ?? "") + it.str;
  }
  return cols;
}

function isCompleteRow(cols: Record<string, string>): boolean {
  if (!cols.date || !/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(cols.date)) return false;
  return REQUIRED_KEYS.every((k) => !!cols[k] && cols[k].trim() !== "");
}

/** 「2026/6/」のように年月まではあるが日が(まだ)無い状態 */
function isDatePrefix(cols: Record<string, string>): boolean {
  return !!cols.date && /^\d{4}\/\d{1,2}\/?$/.test(cols.date);
}

function parseAmountCell(raw: string): number | null {
  const normalized = raw.replace(/[－−﹣]/g, "-"); // 全角マイナスをASCIIに統一
  const cleaned = normalized.replace(/[^\d-]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

function toRow(cols: Record<string, string>): ParsedCreditCardPdfRow | null {
  const dateMatch = cols.date.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!dateMatch) return null;
  const [, year, month, day] = dateMatch;
  const amount = parseAmountCell(cols.usageAmount);
  const merchant = cols.merchant.trim();
  if (amount === null || amount === 0 || !merchant) return null;

  return {
    date: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
    merchant,
    amount,
    type: "expense",
  };
}

async function getPageItems(doc: PDFDocumentProxy, pageNumber: number): Promise<TextItem[]> {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items
    .map((it) => {
      const textItem = it as { str: string; transform: number[] };
      return { x: textItem.transform[4], y: textItem.transform[5], str: textItem.str };
    })
    .filter((it) => it.str.trim() !== "" && it.y >= FOOTER_Y_CUTOFF);
}

function clusterByRow(items: TextItem[]): TextItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const clusters: TextItem[][] = [];
  let current: TextItem[] = [];
  let prevY: number | null = null;
  for (const it of sorted) {
    if (prevY !== null && prevY - it.y > GAP_THRESHOLD) {
      clusters.push(current);
      current = [];
    }
    current.push(it);
    prevY = it.y;
  }
  if (current.length > 0) clusters.push(current);
  return clusters;
}

async function extractRows(doc: PDFDocumentProxy): Promise<ParsedCreditCardPdfRow[]> {
  const rows: ParsedCreditCardPdfRow[] = [];
  let pending: TextItem[] | null = null;

  for (let p = 1; p <= doc.numPages; p++) {
    const items = await getPageItems(doc, p);
    const clusters = clusterByRow(items);

    for (const cluster of clusters) {
      const ownCols = buildCols(cluster);
      if (isCompleteRow(ownCols)) {
        const row = toRow(ownCols);
        if (row) rows.push(row);
        pending = null;
        continue;
      }
      if (isDatePrefix(ownCols)) {
        pending = cluster.slice();
        continue;
      }
      if (pending) {
        const merged: TextItem[] = pending.concat(cluster);
        const mergedCols = buildCols(merged);
        if (isCompleteRow(mergedCols)) {
          const row = toRow(mergedCols);
          if (row) rows.push(row);
          pending = null;
        } else {
          pending = merged;
        }
      }
    }
  }

  return rows;
}

/** 明細書1ページ目の「ご請求金額」欄の金額を検算用に取得する(見つからなければnull) */
async function extractDeclaredTotal(doc: PDFDocumentProxy): Promise<number | null> {
  const items = await getPageItems(doc, 1);
  for (const label of items) {
    if (label.str.trim() !== "ご請求金額") continue;
    const sameLine = items.find(
      (it) => Math.abs(it.y - label.y) < 1 && /^[\d,]+円$/.test(it.str.trim())
    );
    if (sameLine) {
      const amount = parseAmountCell(sameLine.str);
      if (amount !== null) return amount;
    }
  }
  return null;
}

function configureWorker(): void {
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdfjs/pdf.worker.min.mjs`;
  }
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** @param base64Pdf `readFileForExtraction`が返すbase64文字列(FileForExtraction.data) */
export async function tryParsePayPayCardPdf(
  base64Pdf: string
): Promise<ParsedCreditCardPdfRow[] | null> {
  configureWorker();

  let doc: PDFDocumentProxy;
  try {
    doc = await pdfjsLib.getDocument({
      data: base64ToBytes(base64Pdf),
      cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
    }).promise;
  } catch {
    return null;
  }

  const rows = await extractRows(doc);
  if (rows.length === 0) return null;

  const declaredTotal = await extractDeclaredTotal(doc);
  if (declaredTotal !== null) {
    const sum = rows.reduce((total, row) => total + row.amount, 0);
    if (sum !== declaredTotal) return null;
  }

  return rows;
}
