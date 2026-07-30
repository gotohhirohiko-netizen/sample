/** その日付が属する月の月初(00:00:00)を返す */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** 2つの日付が同じ年月かどうか */
export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** その月の日数(28〜31) */
export function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
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

/** 予算・計画の残り金額表示。マイナス(超過)の場合は符号を反転し「超過」として表示する */
export function formatRemaining(remaining: number): string {
  return remaining < 0 ? `超過 ${formatYen(-remaining)}` : `残り ${formatYen(remaining)}`;
}

/** "2026/7/18 13:46"のような表示用文字列(取り込み日時など) */
export function formatDateTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${h}:${m}`;
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
