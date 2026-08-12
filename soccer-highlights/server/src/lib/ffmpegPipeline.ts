import { writeFile } from "node:fs/promises";
import path from "node:path";
import { runCommand } from "./spawnUtil.ts";

/** クリップをフレーム精度で切り出す(再エンコードするため若干時間がかかる)。 */
export async function trimClip(
  sourcePath: string,
  startSec: number,
  endSec: number,
  outPath: string,
  signal?: AbortSignal,
): Promise<void> {
  const duration = endSec - startSec;
  await runCommand(
    "ffmpeg",
    [
      "-y",
      "-ss",
      String(startSec),
      "-i",
      sourcePath,
      "-t",
      String(duration),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      outPath,
    ],
    signal,
  );
}

/** 同一コーデックで書き出したクリップ群をconcat demuxerで結合する(再エンコードなし)。 */
export async function concatClips(
  clipPaths: string[],
  outPath: string,
  tmpDir: string,
  signal?: AbortSignal,
): Promise<void> {
  const listPath = path.join(tmpDir, "concat-list.txt");
  const listContent = clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  await writeFile(listPath, listContent, "utf-8");

  await runCommand(
    "ffmpeg",
    ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath],
    signal,
  );
}

/**
 * 動画の音声トラックを指定のmp3で丸ごと置き換える。
 * mp3を無限ループさせつつ、-shortestで動画の長さに合わせて切り詰める。
 */
export async function replaceAudioWithMusic(
  videoPath: string,
  musicPath: string,
  outPath: string,
  signal?: AbortSignal,
): Promise<void> {
  await runCommand(
    "ffmpeg",
    [
      "-y",
      "-i",
      videoPath,
      "-stream_loop",
      "-1",
      "-i",
      musicPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-shortest",
      "-movflags",
      "+faststart",
      outPath,
    ],
    signal,
  );
}
