import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import express, { type Request, type Response } from "express";
import { tmpDir } from "../config.ts";
import { extractAudioAsMp3, resolvePlaylistVideos, resolveVideoMetadata } from "../lib/ytdlp.ts";
import { sanitizeFileName } from "../lib/sanitize.ts";

export const sourcesRouter = express.Router();

sourcesRouter.post("/resolve", async (req: Request, res: Response) => {
  const youtubeUrl = req.body?.youtubeUrl as string | undefined;
  if (!youtubeUrl) {
    res.status(400).json({ error: "youtubeUrlは必須です" });
    return;
  }

  try {
    const metadata = await resolveVideoMetadata(youtubeUrl);
    res.json(metadata);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

sourcesRouter.post("/resolve-playlist", async (req: Request, res: Response) => {
  const youtubeUrl = req.body?.youtubeUrl as string | undefined;
  if (!youtubeUrl) {
    res.status(400).json({ error: "youtubeUrlは必須です" });
    return;
  }

  try {
    const playlist = await resolvePlaylistVideos(youtubeUrl);
    res.json(playlist);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * YouTube動画から音声だけをmp3として抽出し、そのままダウンロードさせる。
 * フロントエンドはこれをファイルアップロードと同じ扱いで音楽トラック一覧に追加する
 * (再生時間もアップロード時と同じくブラウザ側で計測する)ため、
 * apply-audio側の処理には手を入れていない。
 */
sourcesRouter.post("/extract-audio", async (req: Request, res: Response) => {
  const youtubeUrl = req.body?.youtubeUrl as string | undefined;
  if (!youtubeUrl) {
    res.status(400).json({ error: "youtubeUrlは必須です" });
    return;
  }

  const jobDir = path.join(tmpDir, `audio-extract-${randomUUID()}`);
  await mkdir(jobDir, { recursive: true });
  try {
    const metadata = await resolveVideoMetadata(youtubeUrl);
    const mp3Path = await extractAudioAsMp3(youtubeUrl, jobDir);
    const buffer = await readFile(mp3Path);
    const fileName = `${sanitizeFileName(metadata.title) ?? metadata.videoId}.mp3`;
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.send(buffer);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  } finally {
    await rm(jobDir, { recursive: true, force: true }).catch(() => {});
  }
});
