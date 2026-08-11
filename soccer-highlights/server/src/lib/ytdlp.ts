import { existsSync } from "node:fs";
import path from "node:path";
import { downloadsDir } from "../config.ts";
import { runCommand } from "./spawnUtil.ts";

export interface VideoMetadata {
  videoId: string;
  title: string;
  durationSec: number;
}

/**
 * ダウンロードせずに動画のメタ情報(実際のvideoId/タイトル/再生時間)だけ取得する。
 * フロントエンドでURL入力直後にタイトルを表示するために使う。
 */
export async function resolveVideoMetadata(youtubeUrl: string): Promise<VideoMetadata> {
  const { stdout } = await runCommand("yt-dlp", [
    "--no-playlist",
    "--skip-download",
    "--print",
    "%(id)s\t%(title)s\t%(duration)s",
    youtubeUrl,
  ]);

  const line = stdout.trim().split("\n")[0] ?? "";
  const [videoId, title, durationRaw] = line.split("\t");
  if (!videoId) {
    throw new Error("YouTube動画の情報を取得できませんでした。URLを確認してください。");
  }

  return {
    videoId,
    title: title || videoId,
    durationSec: Number(durationRaw) || 0,
  };
}

export function downloadedFilePath(videoId: string): string {
  return path.join(downloadsDir, `${videoId}.mp4`);
}

/**
 * 動画をmp4としてダウンロードする。既にキャッシュ済みならスキップする。
 * 同じ動画から複数クリップを切り出す場合の再ダウンロードを避けるため、
 * videoId単位で data/downloads/ にキャッシュする。
 */
export async function ensureVideoDownloaded(youtubeUrl: string, videoId: string): Promise<string> {
  const outputPath = downloadedFilePath(videoId);
  if (existsSync(outputPath)) {
    return outputPath;
  }

  await runCommand("yt-dlp", [
    "--no-playlist",
    "-f",
    "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
    "--merge-output-format",
    "mp4",
    "-o",
    outputPath,
    youtubeUrl,
  ]);

  if (!existsSync(outputPath)) {
    throw new Error(`ダウンロードに失敗しました: ${youtubeUrl}`);
  }

  return outputPath;
}
