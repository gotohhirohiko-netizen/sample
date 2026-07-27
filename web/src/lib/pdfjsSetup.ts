import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";

/**
 * カード明細PDFのコード側パーサー(paypayCardPdfParser.ts、rakutenCardPdfParser.ts)が
 * 共通で使うpdf.jsの読み込み処理。ワーカー・CJK用cmap・標準フォントは
 * `web/public/pdfjs/`に配置したものを使う(cmap/標準フォントが無いと日本語の
 * グリフが正しくデコードされず、テキストが欠落することがある)。
 */
export interface TextItem {
  x: number;
  y: number;
  str: string;
  width: number;
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

export async function loadPdfDocument(base64Pdf: string): Promise<PDFDocumentProxy | null> {
  configureWorker();
  try {
    return await pdfjsLib.getDocument({
      data: base64ToBytes(base64Pdf),
      cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
    }).promise;
  } catch {
    return null;
  }
}

export async function getPageItems(doc: PDFDocumentProxy, pageNumber: number): Promise<TextItem[]> {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items
    .map((it) => {
      const textItem = it as { str: string; transform: number[]; width: number };
      return { x: textItem.transform[4], y: textItem.transform[5], str: textItem.str, width: textItem.width };
    })
    .filter((it) => it.str.trim() !== "");
}
