import Anthropic from "@anthropic-ai/sdk";
import type { FundingSourceKind, TransactionType } from "../types/models";

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

const DEFAULT_MODEL = "claude-haiku-4-5";

function buildExtractionSchema(majorCategoryNames: string[]) {
  return {
    type: "object",
    properties: {
      transactions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string", format: "date" },
            merchant: { type: "string" },
            amount: { type: "number" },
            type: { type: "string", enum: ["income", "expense"] },
            majorCategory: { type: ["string", "null"], enum: [...majorCategoryNames, null] },
            subcategory: { type: ["string", "null"] },
          },
          required: ["date", "merchant", "amount", "type", "majorCategory", "subcategory"],
          additionalProperties: false,
        },
      },
    },
    required: ["transactions"],
    additionalProperties: false,
  } as const;
}

function buildInstruction(sourceKind: FundingSourceKind): string {
  return sourceKind === "bankAccount"
    ? "この銀行口座の入出金明細を解析してください。入金はtype=income、出金はtype=expenseとして分類してください。支出については、店名から大カテゴリ・小カテゴリを推定してください。"
    : "このクレジットカードの利用明細を解析してください。原則すべてtype=expenseとし、返金と判断できる行は金額をマイナス値にしてください。店名から大カテゴリ・小カテゴリを推定してください。";
}

/**
 * Claude APIで明細ファイルを解析し、構造化された取引データを抽出する
 * (docs/design.md 4章)。
 *
 * ブラウザから直接Anthropic APIを呼び出すため`dangerouslyAllowBrowser`を
 * 指定する。公開Webサービスでは非推奨とされる設定だが、本アプリは個人専用の
 * 非公開PWAであるためリスクとして許容する(architecture.md 7章参照)。
 */
export async function extractTransactions(
  apiKey: string,
  file: FileForExtraction,
  sourceKind: FundingSourceKind,
  majorCategoryNames: string[],
  model: string = DEFAULT_MODEL
): Promise<ExtractionResult> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const documentBlock =
    file.mimeType === "application/pdf"
      ? ({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: file.data },
        } as const)
      : ({ type: "text", text: file.data } as const);

  const response = await client.messages.create({
    model,
    max_tokens: 8000,
    output_config: {
      format: {
        type: "json_schema",
        schema: buildExtractionSchema(majorCategoryNames),
      },
    },
    messages: [
      {
        role: "user",
        content: [documentBlock, { type: "text", text: buildInstruction(sourceKind) }],
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude APIから有効なレスポンスが得られませんでした");
  }
  return JSON.parse(textBlock.text) as ExtractionResult;
}

/** Fileオブジェクトを抽出用のbase64/テキストデータへ変換する */
export async function readFileForExtraction(file: File): Promise<FileForExtraction> {
  const isPDF = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (isPDF) {
    const buffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    return { data: base64, mimeType: "application/pdf" };
  }
  const text = await file.text();
  return { data: text, mimeType: "text/csv" };
}
