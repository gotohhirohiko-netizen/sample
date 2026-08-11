export function formatTime(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? "-" : "";
  const s = Math.max(0, Math.floor(Math.abs(totalSeconds)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${sign}${h}:${mm}:${ss}` : `${sign}${mm}:${ss}`;
}

/** "mm:ss" / "h:mm:ss" / 秒数のみ、いずれの形式も受け付けて秒数に変換する。不正な入力はnull。 */
export function parseTime(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(":").map((p) => p.trim());
  if (parts.length > 3 || parts.some((p) => p === "" || Number.isNaN(Number(p)))) return null;

  const numbers = parts.map(Number);
  if (numbers.some((n) => n < 0)) return null;

  if (numbers.length === 1) return numbers[0];
  if (numbers.length === 2) {
    const [m, s] = numbers;
    if (s >= 60) return null;
    return m * 60 + s;
  }
  const [h, m, s] = numbers;
  if (m >= 60 || s >= 60) return null;
  return h * 3600 + m * 60 + s;
}
