/** ファイル名として使えない文字を取り除く(Windows/macOS/Linux共通で問題になる文字)。 */
export function sanitizeFileName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const cleaned = name.replace(/[/\\?%*:|"<>]/g, "").trim();
  return cleaned || undefined;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * randomUUID()で生成した値かどうかを検証する。音楽トラックのID(クライアントから渡され、
 * そのままファイルパスの組み立てに使われる)は、パストラバーサルを防ぐため必ずこれで
 * 検証してから使うこと。
 */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
