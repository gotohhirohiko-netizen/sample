import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import express, { type Request, type Response } from "express";
import { projectMusicDir, projectsDir } from "../config.ts";
import { probeMediaDurationSec } from "../lib/audioProbe.ts";
import { isUuid, sanitizeFileName } from "../lib/sanitize.ts";
import { extractAudioAsMp3, resolveVideoMetadata } from "../lib/ytdlp.ts";
import type { Clip, ClipSource, MusicTrackMeta } from "../types.ts";
import multer from "multer";

export const projectsRouter = express.Router();

const trackUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

interface PlaylistVideo {
  videoId: string;
  title: string;
}

interface ProjectPlaylist {
  url: string;
  title: string;
  videos: PlaylistVideo[];
}

interface CombinedVideoInfo {
  file: string;
  durationSec: number;
  clipCount: number;
  createdAt: number;
}

interface ProjectFile {
  name: string;
  sources: ClipSource[];
  clips: Clip[];
  playlist: ProjectPlaylist | null;
  combinedVideo: CombinedVideoInfo | null;
  musicTracks: MusicTrackMeta[];
  updatedAt: number;
}

function projectFilePath(sanitizedName: string): string {
  return path.join(projectsDir, `${sanitizedName}.json`);
}

function requireSanitizedName(req: Request<{ name: string }>, res: Response): string | null {
  const sanitized = sanitizeFileName(req.params.name);
  if (!sanitized) {
    res.status(400).json({ error: "プロジェクト名が不正です" });
    return null;
  }
  return sanitized;
}

projectsRouter.get("/", async (_req: Request, res: Response) => {
  await mkdir(projectsDir, { recursive: true });
  const entries = await readdir(projectsDir);
  const projects = await Promise.all(
    entries
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => {
        const raw = await readFile(path.join(projectsDir, f), "utf-8");
        const data = JSON.parse(raw) as ProjectFile;
        return { name: data.name, updatedAt: data.updatedAt, clipCount: data.clips.length };
      }),
  );
  projects.sort((a, b) => b.updatedAt - a.updatedAt);
  res.json(projects);
});

projectsRouter.get("/:name", async (req: Request<{ name: string }>, res: Response) => {
  const sanitized = requireSanitizedName(req, res);
  if (!sanitized) return;
  try {
    const raw = await readFile(projectFilePath(sanitized), "utf-8");
    const data = JSON.parse(raw) as ProjectFile;
    res.json({ ...data, musicTracks: data.musicTracks ?? [] });
  } catch {
    res.status(404).json({ error: "プロジェクトが見つかりません" });
  }
});

projectsRouter.put("/:name", async (req: Request<{ name: string }>, res: Response) => {
  const sanitized = requireSanitizedName(req, res);
  if (!sanitized) return;

  const { sources, clips, playlist, combinedVideo, musicTracks } = req.body as {
    sources?: ClipSource[];
    clips?: Clip[];
    playlist?: ProjectPlaylist | null;
    combinedVideo?: CombinedVideoInfo | null;
    musicTracks?: MusicTrackMeta[];
  };
  const project: ProjectFile = {
    name: req.params.name,
    sources: sources ?? [],
    clips: clips ?? [],
    playlist: playlist ?? null,
    combinedVideo: combinedVideo ?? null,
    musicTracks: musicTracks ?? [],
    updatedAt: Date.now(),
  };

  await mkdir(projectsDir, { recursive: true });
  await writeFile(projectFilePath(sanitized), JSON.stringify(project, null, 2), "utf-8");
  res.json(project);
});

/** ローカルのmp3ファイルをプロジェクトの音楽フォルダに保存する。 */
projectsRouter.post(
  "/:name/music",
  trackUpload.single("file"),
  async (req: Request<{ name: string }>, res: Response) => {
    const sanitized = requireSanitizedName(req, res);
    if (!sanitized) return;
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "mp3ファイルを指定してください" });
      return;
    }

    const musicDir = projectMusicDir(sanitized);
    await mkdir(musicDir, { recursive: true });
    const id = randomUUID();
    const storedPath = path.join(musicDir, `${id}.mp3`);
    try {
      await writeFile(storedPath, file.buffer);
      const durationSec = await probeMediaDurationSec(storedPath);
      const track: MusicTrackMeta = { id, fileName: file.originalname, durationSec };
      res.json(track);
    } catch (err) {
      await rm(storedPath, { force: true }).catch(() => {});
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

/** YouTube動画から音声だけを抽出し、そのままプロジェクトの音楽フォルダに保存する。 */
projectsRouter.post(
  "/:name/music/extract-from-youtube",
  async (req: Request<{ name: string }>, res: Response) => {
    const sanitized = requireSanitizedName(req, res);
    if (!sanitized) return;
    const youtubeUrl = req.body?.youtubeUrl as string | undefined;
    if (!youtubeUrl) {
      res.status(400).json({ error: "youtubeUrlは必須です" });
      return;
    }

    const musicDir = projectMusicDir(sanitized);
    await mkdir(musicDir, { recursive: true });
    const id = randomUUID();
    const extractDir = path.join(musicDir, `.extract-${id}`);
    await mkdir(extractDir, { recursive: true });
    try {
      const metadata = await resolveVideoMetadata(youtubeUrl);
      const extractedPath = await extractAudioAsMp3(youtubeUrl, extractDir);
      const storedPath = path.join(musicDir, `${id}.mp3`);
      await rename(extractedPath, storedPath);
      const durationSec = await probeMediaDurationSec(storedPath);
      const fileName = `${sanitizeFileName(metadata.title) ?? metadata.videoId}.mp3`;
      const track: MusicTrackMeta = { id, fileName, durationSec };
      res.json(track);
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      await rm(extractDir, { recursive: true, force: true }).catch(() => {});
    }
  },
);

/** プロジェクトに保存済みの音楽トラックを削除する。 */
projectsRouter.delete(
  "/:name/music/:id",
  async (req: Request<{ name: string; id: string }>, res: Response) => {
    const sanitized = requireSanitizedName(req, res);
    if (!sanitized) return;
    if (!isUuid(req.params.id)) {
      res.status(400).json({ error: "不正なIDです" });
      return;
    }

    const filePath = path.join(projectMusicDir(sanitized), `${req.params.id}.mp3`);
    if (!existsSync(filePath)) {
      res.status(404).json({ error: "音楽ファイルが見つかりません" });
      return;
    }
    await rm(filePath, { force: true });
    res.json({ ok: true });
  },
);
