/**
 * 銀行・カード会社のCSV明細で共通して使うパース処理。
 */

/**
 * CSVの1行をセルに分割する。金額列が「"250,000"」のように区切り文字を含んだ
 * まま引用符で囲まれることがあるため、単純な文字列split(delimiter)ではなく、
 * 引用符内の区切り文字を無視するパーサーを使う。
 */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * 「2026/6/1」のようにゼロ埋めされていない月日、および「20260601」のような
 * 区切り文字なしのYYYYMMDD(楽天銀行の取引日等)の両方に対応した日付パース
 */
export function parseCsvDateCell(raw: string): string | null {
  const trimmed = raw.trim();
  const withSeparator = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (withSeparator) {
    const [, year, month, day] = withSeparator;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  if (/^\d{8}$/.test(trimmed)) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
  }
  return null;
}

/**
 * 楽天カードの利用店名に付くカードブランド・処理区分のプレフィックス
 * (例: 「ＶＩＳＡ国内利用　VS ○○」「VISA国内利用　VS ○○」)を取り除く。
 * e-NAVIのCSVは全角(ＶＩＳＡ/ＪＣＢ)、e-NAVIモバイル画面のコピー&貼り付けは
 * 半角(VISA/JCB)で表記されることがあるため、両方に対応する。これを
 * 取り除かないと、同じ店名でも公式PDF明細書側の店名表記と一致せず、
 * 重複判定・カテゴリ学習がすり抜ける。
 */
const RAKUTEN_CARD_BRAND_PREFIX =
  /^(?:VISA|ＶＩＳＡ|JCB|ＪＣＢ)(?:国内|海外)利用[　\s]+(?:[A-Za-z]{1,3}[　\s]+)?/;

export function stripRakutenCardBrandPrefix(merchant: string): string {
  return merchant.replace(RAKUTEN_CARD_BRAND_PREFIX, "").trim();
}
