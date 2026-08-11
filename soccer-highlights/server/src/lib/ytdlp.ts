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

export interface PlaylistVideo {
  videoId: string;
  title: string;
}

export interface PlaylistInfo {
  title: string;
  videos: PlaylistVideo[];
}

/**
 * 再生リストに含まれる動画の一覧(id・タイトルのみ)を取得する。
 * --flat-playlistで各動画の詳細取得を省略し高速に済ませる。
 */
export async function resolvePlaylistVideos(youtubeUrl: string): Promise<PlaylistInfo> {
  const { stdout } = await runCommand("yt-dlp", [
    "--flat-playlist",
    "--dump-single-json",
    youtubeUrl,
  ]);

  let data: { title?: string; entries?: Array<{ id?: string; title?: string }> };
  try {
    data = JSON.parse(stdout);
  } catch {
    throw new Error("再生リスト情報の解析に失敗しました。");
  }

  const videos = (data.entries ?? [])
    .filter((entry): entry is { id: string; title?: string } => typeof entry.id === "string")
    .map((entry) => ({ videoId: entry.id, title: entry.title ?? entry.id }));

  if (videos.length === 0) {
    throw new Error(
      "再生リストに動画が見つかりませんでした。単一動画のURLの場合は上の「読み込む」欄をお使いください。",
    );
  }

  return { title: data.title ?? "再生リスト", videos };
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
