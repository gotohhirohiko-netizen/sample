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
