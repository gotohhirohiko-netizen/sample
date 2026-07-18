/** その日付が属する月の月初(00:00:00)を返す */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** 2つの日付が同じ年月かどうか */
export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** 2つの日付が同じ日かどうか(年月日が一致) */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "2026年7月"のような表示用文字列 */
export function formatYearMonth(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

/** "7月18日(土)"のような表示用文字列 */
export function formatMonthDay(date: Date): string {
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  return `${date.getMonth() + 1}月${date.getDate()}日(${weekday})`;
}

/** ¥1,234 のような表示用文字列 */
export function formatYen(amount: number): string {
  return `¥${Math.round(amount).toLocaleString("ja-JP")}`;
}

/** ルーティング用に月を"yyyy-MM"形式の文字列へ変換する */
export function monthToParam(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** "yyyy-MM"形式の文字列をその月の1日のDateへ変換する */
export function parseMonthParam(param: string | undefined): Date {
  if (!param) return startOfMonth(new Date());
  const [year, month] = param.split("-").map(Number);
  if (!year || !month) return startOfMonth(new Date());
  return new Date(year, month - 1, 1);
}
