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
 * 動画の音声トラックを、指定した順番のmp3群を連結したものに丸ごと置き換える。
 * 音楽の合計時間が動画より短い場合は無音でパディングする(動画を切り詰めない)。
 * 長い場合は-shortestで動画の長さに合わせて切り詰める。
 */
export async function replaceAudioWithMusicTracks(
  videoPath: string,
  musicPaths: string[],
  outPath: string,
  signal?: AbortSignal,
): Promise<void> {
  const inputArgs = [videoPath, ...musicPaths].flatMap((p) => ["-i", p]);
  const n = musicPaths.length;
  const audioInputs = musicPaths.map((_, i) => `[${i + 1}:a]`).join("");
  const filterComplex =
    n === 1 ? "[1:a]apad[aout]" : `${audioInputs}concat=n=${n}:v=0:a=1[acat];[acat]apad[aout]`;

  await runCommand(
    "ffmpeg",
    [
      "-y",
      ...inputArgs,
      "-filter_complex",
      filterComplex,
      "-map",
      "0:v:0",
      "-map",
      "[aout]",
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
