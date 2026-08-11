/** ファイル名として使えない文字を取り除く(Windows/macOS/Linux共通で問題になる文字)。 */
export function sanitizeFileName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const cleaned = name.replace(/[/\\?%*:|"<>]/g, "").trim();
  return cleaned || undefined;
}
