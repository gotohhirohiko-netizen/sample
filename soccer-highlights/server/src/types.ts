// フロントエンド側の src/types.ts と型定義を揃えている(モジュール解決方式が
// bundler/nodenextで異なるため、共有パッケージ化はせずあえて重複させている)。

export interface ClipSource {
  /** yt-dlpが解決した実際のYouTube動画ID */
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
  | "cancelled";

export interface JobStatus {
  id: string;
  stage: JobStage;
  progress: number;
  message?: string;
  outputFile?: string;
  error?: string;
  createdAt: number;
}

export interface ExportRequestPayload {
  clips: Clip[];
  sources: ClipSource[];
  outputName?: string;
}
