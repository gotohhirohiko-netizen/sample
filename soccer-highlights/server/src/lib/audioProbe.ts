import { runCommand } from "./spawnUtil.ts";

/** ffprobeでメディアファイル(mp3・mp4等)の再生時間(秒)を取得する。コンテナレベルの
 * durationを見るだけなので音声・映像どちらのファイルにも使える。 */
export async function probeMediaDurationSec(filePath: string): Promise<number> {
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
