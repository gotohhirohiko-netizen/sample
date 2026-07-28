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
