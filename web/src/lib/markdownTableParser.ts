/**
 * 「日付・内容・金額・区分」のmarkdownテーブル(Claude Desktop等のエージェントが
 * 明細ページから書き出す想定の固定フォーマット)を判定・解析する。
 * 列構成が一致する場合はコード側で機械的にパースし、Claude APIを呼ばずに済ませる。
 * 一致しない場合はnullを返し、Claudeによる解析にフォールバックする。
 */
export interface ParsedMarkdownRow {
  date: string; // "YYYY-MM-DD"
  merchant: string;
  amount: number;
  type: "income" | "expense";
}

const DATE_HEADER_NAMES = ["日付", "取引日"];
const MERCHANT_HEADER_NAMES = ["内容", "店名", "摘要"];
const AMOUNT_HEADER_NAMES = ["金額"];
const TYPE_HEADER_NAMES = ["区分", "種別"];

function splitTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return null;
  const inner = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((c) => c.trim());
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

function normalizeDate(raw: string): string | null {
  const normalized = raw.replace(/\//g, "-");
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

export function tryParseMarkdownTransactionTable(text: string): ParsedMarkdownRow[] | null {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");

  for (let i = 0; i < lines.length - 1; i++) {
    const headerCells = splitTableRow(lines[i]);
    if (!headerCells) continue;
    const sepCells = splitTableRow(lines[i + 1]);
    if (!sepCells || sepCells.length !== headerCells.length || !isSeparatorRow(sepCells)) continue;

    const dateIndex = headerCells.findIndex((c) => DATE_HEADER_NAMES.includes(c));
    const merchantIndex = headerCells.findIndex((c) => MERCHANT_HEADER_NAMES.includes(c));
    const amountIndex = headerCells.findIndex((c) => AMOUNT_HEADER_NAMES.includes(c));
    const typeIndex = headerCells.findIndex((c) => TYPE_HEADER_NAMES.includes(c));
    if (dateIndex === -1 || merchantIndex === -1 || amountIndex === -1 || typeIndex === -1) {
      return null;
    }

    const rows: ParsedMarkdownRow[] = [];
    for (let j = i + 2; j < lines.length; j++) {
      const cells = splitTableRow(lines[j]);
      if (!cells) break;
      if (cells.length !== headerCells.length) return null;

      const date = normalizeDate(cells[dateIndex]);
      const merchant = cells[merchantIndex];
      const amountRaw = Number(cells[amountIndex].replace(/[,¥\s]/g, ""));
      const typeRaw = cells[typeIndex];
      const type = typeRaw === "収入" ? "income" : typeRaw === "支出" ? "expense" : null;

      if (!date || !merchant || !Number.isFinite(amountRaw) || amountRaw <= 0 || !type) {
        return null;
      }

      rows.push({ date, merchant, amount: amountRaw, type });
    }

    return rows.length > 0 ? rows : null;
  }

  return null;
}
