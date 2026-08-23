import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "../config.ts";
import { sanitizeFileName } from "./sanitize.ts";
import type { Clip, ClipSource, VideoQuality } from "../types.ts";

export const workRootDir = path.join(dataDir, "work");

export interface WorkMeta {
  clips: Clip[];
  sources: ClipSource[];
  outputName?: string;
  quality: VideoQuality;
  createdAt: number;
}

export interface WorkPaths {
  root: string;
  downloadsDir: string;
  clipsDir: string;
  metaPath: string;
}

/** プロジェクト名をそのまま作業フォルダのキーにする(ファイル名として不正な文字だけ除く)。 */
export function sanitizeWorkKey(projectName: string | undefined): string | null {
  return sanitizeFileName(projectName) ?? null;
}

export function workPathsFor(key: string): WorkPaths {
  const root = path.join(workRootDir, key);
  return {
    root,
    downloadsDir: path.join(root, "downloads"),
    clipsDir: path.join(root, "clips"),
    metaPath: path.join(root, "meta.json"),
  };
}

export function clipOutputPath(paths: WorkPaths, clipId: string): string {
  return path.join(paths.clipsDir, `${clipId}.mp4`);
}

export async function ensureWorkDirs(paths: WorkPaths): Promise<void> {
  await mkdir(paths.downloadsDir, { recursive: true });
  await mkdir(paths.clipsDir, { recursive: true });
}

export async function readWorkMeta(paths: WorkPaths): Promise<WorkMeta | null> {
  try {
    const raw = await readFile(paths.metaPath, "utf-8");
    const meta = JSON.parse(raw) as WorkMeta;
    // qualityフィールド追加前に作られたmeta.jsonとの互換性のため、無ければ従来通りの挙動(best)にする。
    return { ...meta, quality: meta.quality ?? "best" };
  } catch {
    return null;
  }
}

export async function writeWorkMeta(paths: WorkPaths, meta: WorkMeta): Promise<void> {
  await writeFile(paths.metaPath, JSON.stringify(meta, null, 2), "utf-8");
}

export async function clearWork(paths: WorkPaths): Promise<void> {
  await rm(paths.root, { recursive: true, force: true });
}

export interface ResumeStatus {
  resumable: boolean;
  totalClips: number;
  doneClips: number;
  outputName?: string;
}

export async function getResumeStatus(paths: WorkPaths): Promise<ResumeStatus> {
  const meta = await readWorkMeta(paths);
  if (!meta) return { resumable: false, totalClips: 0, doneClips: 0 };
  const doneClips = meta.clips.filter((c) => existsSync(clipOutputPath(paths, c.id))).length;
  return { resumable: true, totalClips: meta.clips.length, doneClips, outputName: meta.outputName };
}
