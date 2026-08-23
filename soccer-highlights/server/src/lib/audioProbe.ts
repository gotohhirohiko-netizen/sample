import { runCommand } from "./spawnUtil.ts";

/** ffprobeでmp3ファイルの再生時間(秒)を取得する。音楽トラックをプロジェクトに保存する際、
 * クライアントに頼らずサーバー側だけで正確な長さを把握できるようにするために使う。 */
export async function probeAudioDurationSec(filePath: string): Promise<number> {
  const { stdout } = await runCommand("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const value = Number(stdout.trim());
  return Number.isFinite(value) ? value : 0;
}
