import type { TransactionType } from "../types/models";

export interface ExtractionResultItem {
  date: string;
  merchant: string;
  amount: number;
  type: TransactionType;
  majorCategory: string | null;
  subcategory: string | null;
}

export interface ExtractionResult {
  transactions: ExtractionResultItem[];
}

export interface FileForExtraction {
  /** PDFの場合はbase64文字列、CSVの場合はテキストそのもの */
  data: string;
  mimeType: "application/pdf" | "text/csv";
}

/**
 * FileをBase64文字列へ変換する。`String.fromCharCode(...bytes)`のように
 * スプレッド構文でバイト列全体を関数の引数として渡すと、実際のPDF程度の
 * サイズでも呼び出し元の引数上限を超えて"Maximum call stack size exceeded"
 * になるため、ブラウザ標準のFileReader(readAsDataURL)を使う。
 */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("ファイルの読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });
}

/**
 * CSVのテキストをデコードする。三菱UFJ銀行をはじめ日本の銀行・カード会社の
 * CSV明細はShift-JIS(CP932)で出力されることが多く、`File.text()`は常に
 * UTF-8として解釈するため、Shift-JISのファイルを読み込むと店名等が文字化け
 * してしまう。まずUTF-8として厳密デコードを試し、不正なバイト列で失敗したら
 * Shift-JISとして読み直す。
 */
async function readCsvText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("shift-jis").decode(buffer);
  }
}

/** Fileオブジェクトを抽出用のbase64/テキストデータへ変換する */
export async function readFileForExtraction(file: File): Promise<FileForExtraction> {
  const isPDF = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (isPDF) {
    const base64 = await readFileAsBase64(file);
    return { data: base64, mimeType: "application/pdf" };
  }
  const text = await readCsvText(file);
  return { data: text, mimeType: "text/csv" };
}
