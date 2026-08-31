import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { VideoQuality } from "../types.ts";
import { runCommand } from "./spawnUtil.ts";

export interface TargetResolution {
  width: number;
  height: number;
}

/** 画質設定ごとに、クリップ切り出し時に統一する解像度(キャンバスサイズ)。
 * "best"は動画ごとに実際に取得できる解像度が(4K/1080p等)バラつくため、
 * 常にこの解像度に揃えることでconcat時のカクつきを防ぐ。 */
export const QUALITY_TARGET_RESOLUTION: Record<VideoQuality, TargetResolution> = {
  best: { width: 3840, height: 2160 },
  "1080": { width: 1920, height: 1080 },
  "720": { width: 1280, height: 720 },
};

/**
 * クリップをフレーム精度で切り出す(再エンコードするため若干時間がかかる)。
 * 参照元の動画ごとに実際の解像度・フレームレート・音声サンプルレートが異なることがある
 * (同じ「最高画質」設定でも、動画によって4Kだったり1080pだったりする)。揃えないまま
 * 後段のconcat demuxer(-c copy、無劣化結合)にかけると、コマ送りのようなカクつきや
 * 音ズレが起きることがあるため、targetResolutionに合わせてスケール+パディングし、
 * フレームレート・音声サンプルレートも固定して、常に同一パラメータになるようにする。
 */
export async function trimClip(
  sourcePath: string,
  startSec: number,
  endSec: number,
  outPath: string,
  targetResolution: TargetResolution,
  signal?: AbortSignal,
): Promise<void> {
  const duration = endSec - startSec;
  const { width, height } = targetResolution;
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
      "-vf",
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
      "-r",
      "30",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-movflags",
      "+faststart",
      outPath,
    ],
    signal,
  );
}

/** 既存の動画ファイルの実際の解像度をffprobeで取得する。クリップを1本だけ差し替える際、
 * 新しく作るクリップを既存の結合済み動画とまったく同じ解像度に合わせるために使う
 * (揃っていないとconcat demuxerでの差し替えができない)。 */
export async function probeVideoResolution(filePath: string): Promise<TargetResolution> {
  const { stdout } = await runCommand("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=s=x:p=0",
    filePath,
  ]);
  const [widthRaw, heightRaw] = stdout.trim().split("x");
  const width = Number(widthRaw);
  const height = Number(heightRaw);
  if (!width || !height) {
    throw new Error(`動画の解像度を取得できませんでした: ${filePath}`);
  }
  return { width, height };
}

/**
 * 既に結合済みの動画から、指定した範囲を再エンコードなし(-c copy)で切り出す。
 * クリップ1本だけの差し替え時、差し替え対象の前後をそのまま保持するために使う。
 * 各クリップは元々1本ずつ独立してエンコードされ、その境界がそのままキーフレームに
 * なっているため、クリップの境界で切ればコピーでもズレが生じない。
 * startSecを省略すると先頭から、durationSecを省略すると末尾までになる。
 */
export async function extractSegmentCopy(
  inputPath: string,
  outPath: string,
  options: { startSec?: number; durationSec?: number },
  signal?: AbortSignal,
): Promise<void> {
  const args = ["-y"];
  if (options.startSec !== undefined) args.push("-ss", String(options.startSec));
  args.push("-i", inputPath);
  if (options.durationSec !== undefined) args.push("-t", String(options.durationSec));
  args.push("-c", "copy", outPath);
  await runCommand("ffmpeg", args, signal);
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

/**
 * videoPathの映像はそのまま(-c:v copy、再エンコードなし)保ちつつ、音声だけを
 * cutSecより前はbeforeAudioPath(nullならvideoPath自身)の音声、cutSec以降は
 * musicPaths(連結+パディング)に差し替えて、1回のffmpeg実行で直接書き出す。
 * 中間ファイル(差し替え前後を別々に書き出してから結合する等)を作らないため、
 * 映像を含む巨大な一時ファイルでディスクを圧迫することがない。
 * 音声だけを扱うため、映像の途中シークにありがちなキーフレーム精度の問題も生じない。
 */
export async function replaceAudioSplit(
  videoPath: string,
  beforeAudioPath: string | null,
  cutSec: number,
  totalDurationSec: number,
  musicPaths: string[],
  outPath: string,
  signal?: AbortSignal,
): Promise<void> {
  const afterDurationSec = totalDurationSec - cutSec;
  const beforeAudioInputPath = beforeAudioPath ?? videoPath;
  const inputs = [videoPath, beforeAudioInputPath, ...musicPaths];
  const musicStartIndex = 2;
  const n = musicPaths.length;
  const musicInputs = musicPaths.map((_, i) => `[${musicStartIndex + i}:a]`).join("");
  const musicConcat =
    n === 1
      ? `[${musicStartIndex}:a]apad[mpad]`
      : `${musicInputs}concat=n=${n}:v=0:a=1[mcat];[mcat]apad[mpad]`;

  const filterComplex = [
    `[1:a]atrim=0:${cutSec},asetpts=PTS-STARTPTS[before_a]`,
    musicConcat,
    `[mpad]atrim=0:${afterDurationSec},asetpts=PTS-STARTPTS[after_a]`,
    `[before_a][after_a]concat=n=2:v=0:a=1[aout]`,
  ].join(";");

  await runCommand(
    "ffmpeg",
    [
      "-y",
      ...inputs.flatMap((p) => ["-i", p]),
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
      "-ar",
      "48000",
      "-movflags",
      "+faststart",
      outPath,
    ],
    signal,
  );
}
