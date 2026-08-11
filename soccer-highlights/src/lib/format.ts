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
