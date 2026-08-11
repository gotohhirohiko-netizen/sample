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

export interface ProjectData {
  name: string;
  sources: ClipSource[];
  clips: Clip[];
  playlist: ProjectPlaylist | null;
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
): Promise<ProjectData> {
  return fetch(`/api/projects/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sources, clips, playlist }),
  }).then((res) => asJson<ProjectData>(res));
}

export function startExport(
  clips: Clip[],
  sources: ClipSource[],
  outputName: string,
  musicFile: File | null,
): Promise<{ jobId: string }> {
  const formData = new FormData();
  formData.append("payload", JSON.stringify({ clips, sources, outputName }));
  if (musicFile) formData.append("music", musicFile);

  return fetch("/api/export", { method: "POST", body: formData }).then((res) =>
    asJson<{ jobId: string }>(res),
  );
}

export function getJobStatus(jobId: string): Promise<JobStatus> {
  return fetch(`/api/export/${jobId}`).then((res) => asJson<JobStatus>(res));
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
