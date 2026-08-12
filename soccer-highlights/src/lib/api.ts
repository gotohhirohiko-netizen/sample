import type { Clip, ClipSource, JobStatus } from "../types.ts";

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error ?? `リクエストに失敗しました (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export interface VideoMetadata {
  videoId: string;
  title: string;
  durationSec: number;
}

export function resolveSource(youtubeUrl: string): Promise<VideoMetadata> {
  return fetch("/api/sources/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ youtubeUrl }),
  }).then((res) => asJson<VideoMetadata>(res));
}

export interface PlaylistVideo {
  videoId: string;
  title: string;
}

export function resolvePlaylist(youtubeUrl: string): Promise<{ title: string; videos: PlaylistVideo[] }> {
  return fetch("/api/sources/resolve-playlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ youtubeUrl }),
  }).then((res) => asJson<{ title: string; videos: PlaylistVideo[] }>(res));
}

export interface ProjectSummary {
  name: string;
  updatedAt: number;
  clipCount: number;
}

export interface ProjectPlaylist {
  url: string;
  title: string;
  videos: PlaylistVideo[];
}

export interface CombinedVideoInfo {
  file: string;
  durationSec: number;
  clipCount: number;
  createdAt: number;
}

export interface ProjectData {
  name: string;
  sources: ClipSource[];
  clips: Clip[];
  playlist: ProjectPlaylist | null;
  combinedVideo: CombinedVideoInfo | null;
  updatedAt: number;
}

export function listProjects(): Promise<ProjectSummary[]> {
  return fetch("/api/projects").then((res) => asJson<ProjectSummary[]>(res));
}

export function loadProject(name: string): Promise<ProjectData> {
  return fetch(`/api/projects/${encodeURIComponent(name)}`).then((res) => asJson<ProjectData>(res));
}

export function saveProject(
  name: string,
  sources: ClipSource[],
  clips: Clip[],
  playlist: ProjectPlaylist | null,
  combinedVideo: CombinedVideoInfo | null,
): Promise<ProjectData> {
  return fetch(`/api/projects/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sources, clips, playlist, combinedVideo }),
  }).then((res) => asJson<ProjectData>(res));
}

/**
 * クリップの切り抜き・結合のみを行う(音声は差し替えない)。結合結果はdata/output/に残り、
 * あとでapplyAudioTracksから何度でも音楽を差し替えられる。
 * projectNameはプロジェクトごとの作業フォルダ(一時停止・再開用)を特定するために必須。
 * resume:trueの場合、clips/sourcesは無視され前回中断した内容から再開する。
 */
export function startExport(
  clips: Clip[],
  sources: ClipSource[],
  outputName: string,
  projectName: string,
  resume: boolean,
): Promise<{ jobId: string }> {
  return fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clips, sources, outputName, projectName, resume }),
  }).then((res) => asJson<{ jobId: string }>(res));
}

export interface ResumeStatus {
  resumable: boolean;
  totalClips: number;
  doneClips: number;
  outputName?: string;
}

export function getExportResumeStatus(projectName: string): Promise<ResumeStatus> {
  return fetch(`/api/export/resume-status?projectName=${encodeURIComponent(projectName)}`).then((res) =>
    asJson<ResumeStatus>(res),
  );
}

/** 実行中の書き出しジョブに一時停止をリクエストする。動画のダウンロード完了・クリップの
 * 切り出し完了などキリのいい時点で安全に停止し、再開可能な状態で残す。 */
export function pauseExport(jobId: string): Promise<{ ok: true }> {
  return fetch(`/api/export/${jobId}/pause`, { method: "POST" }).then((res) => asJson<{ ok: true }>(res));
}

/** 既に結合済みの動画に、指定順のmp3群を音声として適用する。 */
export function applyAudioTracks(
  combinedFile: string,
  outputName: string,
  musicFiles: File[],
): Promise<{ jobId: string }> {
  const formData = new FormData();
  formData.append("combinedFile", combinedFile);
  formData.append("outputName", outputName);
  musicFiles.forEach((file) => formData.append("music", file));

  return fetch("/api/export/apply-audio", { method: "POST", body: formData }).then((res) =>
    asJson<{ jobId: string }>(res),
  );
}

export function getJobStatus(jobId: string): Promise<JobStatus> {
  return fetch(`/api/export/${jobId}`).then((res) => asJson<JobStatus>(res));
}

export function cancelExport(jobId: string, deleteCache: boolean): Promise<{ ok: true }> {
  return fetch(`/api/export/${jobId}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deleteCache }),
  }).then((res) => asJson<{ ok: true }>(res));
}

export function getDiskSpace(): Promise<{ freeBytes: number; freeGb: string }> {
  return fetch("/api/system/disk-space").then((res) => asJson<{ freeBytes: number; freeGb: string }>(res));
}

export interface OutputFile {
  name: string;
  sizeBytes: number;
  createdAt: number;
}

export function listOutputs(): Promise<OutputFile[]> {
  return fetch("/api/output").then((res) => asJson<OutputFile[]>(res));
}

export function getYoutubeAuthStatus(): Promise<{ authenticated: boolean }> {
  return fetch("/api/youtube/status").then((res) => asJson<{ authenticated: boolean }>(res));
}

export function getYoutubeAuthUrl(): Promise<{ url: string }> {
  return fetch("/api/youtube/auth-url").then((res) => asJson<{ url: string }>(res));
}

export function uploadToYoutube(params: {
  outputFile: string;
  title: string;
  description: string;
  privacyStatus: "private" | "unlisted" | "public";
}): Promise<{ videoId: string; url: string }> {
  return fetch("/api/youtube/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then((res) => asJson<{ videoId: string; url: string }>(res));
}
