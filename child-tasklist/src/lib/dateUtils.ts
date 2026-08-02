export function todayInTokyo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** "HH:mm:ss" を "HH:mm" 表示に整形する */
export function formatTime(target_time: string): string {
  return target_time.slice(0, 5);
}

/** "YYYY-MM-DD"にdelta日を加算した"YYYY-MM-DD"を返す(JST基準) */
export function addDaysJST(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  // 正午UTCを基準にすることで、JST(DSTなし)の日付計算がタイムゾーンのずれで狂わないようにする
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  date.setUTCDate(date.getUTCDate() + delta);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** "YYYY-MM-DD" を "8月2日(日)" のような表示用文字列に整形する */
export function formatDateJa(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const weekday = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", weekday: "short" }).format(
    date,
  );
  return `${m}月${d}日(${weekday})`;
}
