// server/src/types.ts と型定義を揃えている(モジュール解決方式の違いにより
// 共有パッケージ化はせず、あえて重複させている)。

export interface ClipSource {
  videoId: string;
  youtubeUrl: string;
  title?: string;
}

export interface Clip {
  id: string;
  sourceVideoId: string;
  label: string;
  startSec: number;
  endSec: number;
}

export type JobStage =
  | "queued"
  | "downloading"
  | "trimming"
  | "concatenating"
  | "applying-audio"
  | "done"
  | "error"
  | "cancelled"
  | "paused";

export interface JobStatus {
  id: string;
  stage: JobStage;
  progress: number;
  message?: string;
  outputFile?: string;
  error?: string;
  createdAt: number;
}

/** "best"は元動画で配信されている最高解像度(4K等)をそのまま使う。他は指定した高さ以下に制限する。 */
export const VIDEO_QUALITIES = ["best", "1080", "720"] as const;
export type VideoQuality = (typeof VIDEO_QUALITIES)[number];
