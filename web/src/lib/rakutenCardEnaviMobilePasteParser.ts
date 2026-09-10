import { parseCsvDateCell, stripRakutenCardBrandPrefix } from "./csvUtils";

/**
 * 楽天カードe-NAVIのスマートフォン版「ご利用明細」画面からコピー&貼り付けした
 * テキストを解析する。e-NAVIのCSVダウンロードはPC版サイト限定のため、
 * モバイル版しか開けない場合の代替手段として使う(当月未確定分も含む)。
 *
 * この画面のテキストは1件の取引が2行に分かれてコピーされる(タブ区切り):
 *   1行目: 利用日 タブ 利用店名
 *   2行目: 利用者(本人/家族) タブ 支払方法(1回払い等) タブ ￥金額 タブ 操作リンク文言
 * ヘッダー行(利用日・利用店名・利用者・支払方法・利用金額)がテキスト内に
 * あることを確認してから、日付行+金額行のペアを順に読み取る。
 */
export interface ParsedRakutenCardEnaviPasteRow {
  date: string; // "YYYY-MM-DD"
  merchant: string;
  amount: number; // 支出は正、キャンセル等でマイナス表記の場合はマイナス
  type: "expense";
}

const DATE_LINE_REGEX = /^(\d{4}\/\d{1,2}\/\d{1,2})\t(.+)$/;

function hasExpectedHeader(lines: string[]): boolean {
  return lines.some((line) => {
    const cells = line.split("\t").map((c) => c.trim());
    return (
      cells.includes("利用日") &&
      cells.includes("利用店名") &&
      cells.includes("利用者") &&
      cells.includes("支払方法") &&
      cells.includes("利用金額")
    );
  });
}

function parseAmount(line: string): number | null {
  const normalized = line.replace(/[－−﹣]/g, "-");
  const match = normalized.match(/[¥￥]\s*(-?[\d,]+)/);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

export function tryParseRakutenCardEnaviMobilePaste(
  text: string
): ParsedRakutenCardEnaviPasteRow[] | null {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");
  if (lines.length < 2 || !hasExpectedHeader(lines)) return null;

  const rows: ParsedRakutenCardEnaviPasteRow[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const dateMatch = lines[i].match(DATE_LINE_REGEX);
    if (!dateMatch) continue;
    const amount = parseAmount(lines[i + 1]);
    if (amount === null) continue;

    const date = parseCsvDateCell(dateMatch[1]);
    const merchant = stripRakutenCardBrandPrefix(dateMatch[2].trim());
    if (!date || !merchant || amount === 0) {
      i++;
      continue;
    }

    rows.push({ date, merchant, amount, type: "expense" });
    i++; // 金額行を消費済みなので次の反復では読み飛ばす
  }

  return rows.length > 0 ? rows : null;
}
