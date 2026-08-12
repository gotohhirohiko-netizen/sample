import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import express, { type Request, type Response } from "express";
import multer from "multer";
import { outputDir, tmpDir } from "../config.ts";
import { assertEnoughDiskSpace, formatBytesAsGb, getFreeDiskSpaceBytes } from "../lib/diskSpace.ts";
import { concatClips, replaceAudioWithMusic, trimClip } from "../lib/ffmpegPipeline.ts";
import { cancelJob, clearJobController, createJob, getJob, registerJobController, setJobStage } from "../lib/jobs.ts";
import { sanitizeFileName } from "../lib/sanitize.ts";
import { CancelledError } from "../lib/spawnUtil.ts";
import { ensureVideoDownloaded } from "../lib/ytdlp.ts";
import type { ExportRequestPayload } from "../types.ts";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

export const exportRouter = express.Router();

exportRouter.post("/", upload.single("music"), async (req: Request, res: Response) => {
  let payload: ExportRequestPayload;
  try {
    payload = JSON.parse(req.body.payload) as ExportRequestPayload;
  } catch {
    res.status(400).json({ error: "payloadの形式が不正です" });
    return;
  }

  if (!payload.clips?.length) {
    res.status(400).json({ error: "クリップが1つもありません" });
    return;
  }

  try {
    await assertEnoughDiskSpace();
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    return;
  }

  const jobId = randomUUID();
  createJob(jobId);

  runExportPipeline(jobId, payload, req.file?.buffer).catch((err: unknown) => {
    if (err instanceof CancelledError) return; // runExportPipeline側で既にstage更新済み
    setJobStage(jobId, "error", 100, err instanceof Error ? err.message : String(err));
  });

  res.status(202).json({ jobId });
});

exportRouter.get("/:jobId", (req: Request<{ jobId: string }>, res: Response) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "ジョブが見つかりません" });
    return;
  }
  res.json(job);
});

exportRouter.post("/:jobId/cancel", (req: Request<{ jobId: string }>, res: Response) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "ジョブが見つかりません" });
    return;
  }
  if (job.stage === "done" || job.stage === "error" || job.stage === "cancelled") {
    res.status(400).json({ error: "このジョブは既に終了しています" });
    return;
  }
  const cancelled = cancelJob(req.params.jobId);
  if (!cancelled) {
    res.status(400).json({ error: "キャンセルできませんでした" });
    return;
  }
  res.status(202).json({ ok: true });
});

exportRouter.get("/:jobId/download", (req: Request<{ jobId: string }>, res: Response) => {
  const job = getJob(req.params.jobId);
  if (!job || job.stage !== "done" || !job.outputFile) {
    res.status(404).json({ error: "まだ書き出しが完了していません" });
    return;
  }
  res.download(path.join(outputDir, job.outputFile));
});

async function runExportPipeline(
  jobId: string,
  payload: ExportRequestPayload,
  musicBuffer: Buffer | undefined,
): Promise<void> {
  const jobTmpDir = path.join(tmpDir, jobId);
  await mkdir(jobTmpDir, { recursive: true });

  const controller = new AbortController();
  registerJobController(jobId, controller);
  const { signal } = controller;

  try {
    const sourceByVideoId = new Map(payload.sources.map((s) => [s.videoId, s]));

    // 1. 参照されている元動画をダウンロード(重複はキャッシュ済みならスキップ)
    const uniqueVideoIds = [...new Set(payload.clips.map((c) => c.sourceVideoId))];
    const localPathByVideoId = new Map<string, string>();
    for (let i = 0; i < uniqueVideoIds.length; i++) {
      if (signal.aborted) throw new CancelledError();
      await assertEnoughDiskSpace();

      const videoId = uniqueVideoIds[i];
      const source = sourceByVideoId.get(videoId);
      if (!source) throw new Error(`クリップが参照する動画が見つかりません: ${videoId}`);

      setJobStage(
        jobId,
        "downloading",
        Math.round((i / uniqueVideoIds.length) * 30),
        `元動画を取得中 (${i + 1}/${uniqueVideoIds.length}): ${source.title ?? source.youtubeUrl}`,
      );
      const localPath = await ensureVideoDownloaded(source.youtubeUrl, videoId, signal);
      localPathByVideoId.set(videoId, localPath);
    }

    // 2. 各クリップを切り出し
    // クリップ一覧の中で各動画が最後に使われるインデックスを事前に調べておき、
    // そこまで切り出しが終わった時点でダウンロード済みの元動画を即座に削除する
    // (試合動画は1本あたり数百MB〜になるため、ダウンロードキャッシュを溜め込まないようにする)
    const lastClipIndexForVideo = new Map<string, number>();
    payload.clips.forEach((clip, index) => lastClipIndexForVideo.set(clip.sourceVideoId, index));

    const clipPaths: string[] = [];
    for (let i = 0; i < payload.clips.length; i++) {
      if (signal.aborted) throw new CancelledError();
      await assertEnoughDiskSpace();

      const clip = payload.clips[i];
      const sourcePath = localPathByVideoId.get(clip.sourceVideoId);
      if (!sourcePath) throw new Error(`クリップの元動画が未ダウンロードです: ${clip.sourceVideoId}`);

      setJobStage(
        jobId,
        "trimming",
        30 + Math.round((i / payload.clips.length) * 30),
        `クリップを切り出し中 (${i + 1}/${payload.clips.length}): ${clip.label || "無題"}`,
      );
      const clipOutPath = path.join(jobTmpDir, `clip-${i}.mp4`);
      await trimClip(sourcePath, clip.startSec, clip.endSec, clipOutPath, signal);
      clipPaths.push(clipOutPath);

      if (lastClipIndexForVideo.get(clip.sourceVideoId) === i) {
        await rm(sourcePath, { force: true }).catch(() => {});
      }
    }

    if (signal.aborted) throw new CancelledError();

    // 3. 結合
    setJobStage(jobId, "concatenating", 65, "クリップを結合中...");
    const concatenatedPath = path.join(jobTmpDir, "concatenated.mp4");
    await concatClips(clipPaths, concatenatedPath, jobTmpDir, signal);

    // 4. 音楽で音声を上書き(指定時のみ)
    let finalPath = concatenatedPath;
    if (musicBuffer) {
      if (signal.aborted) throw new CancelledError();
      setJobStage(jobId, "applying-audio", 85, "音声を差し替え中...");
      const musicPath = path.join(jobTmpDir, "music.mp3");
      await writeFile(musicPath, musicBuffer);
      finalPath = path.join(jobTmpDir, "final.mp4");
      await replaceAudioWithMusic(concatenatedPath, musicPath, finalPath, signal);
    }

    // 5. 出力先へ配置
    const safeName = sanitizeFileName(payload.outputName) ?? `highlight-${jobId.slice(0, 8)}`;
    const outputFile = `${safeName}.mp4`;
    await mkdir(outputDir, { recursive: true });
    await rename(finalPath, path.join(outputDir, outputFile));

    // 中間ファイル(切り出し済みクリップ等)を削除。元動画のダウンロードキャッシュは
    // 上のループで既に不要になった時点で削除済み。
    await rm(jobTmpDir, { recursive: true, force: true });

    setJobStage(jobId, "done", 100, "完了しました");
    const job = getJob(jobId);
    if (job) job.outputFile = outputFile;
  } catch (err) {
    if (err instanceof CancelledError) {
      setJobStage(jobId, "cancelled", 100, "キャンセルされました");
      await rm(jobTmpDir, { recursive: true, force: true }).catch(() => {});
      return;
    }
    throw err;
  } finally {
    clearJobController(jobId);
  }
}

export const outputRouter = express.Router();

outputRouter.get("/", async (_req: Request, res: Response) => {
  await mkdir(outputDir, { recursive: true });
  const entries = await readdir(outputDir);
  const files = await Promise.all(
    entries
      .filter((name) => name.endsWith(".mp4"))
      .map(async (name) => {
        const info = await stat(path.join(outputDir, name));
        return { name, sizeBytes: info.size, createdAt: info.mtimeMs };
      }),
  );
  res.json(files);
});

outputRouter.get("/:name/download", (req: Request<{ name: string }>, res: Response) => {
  res.download(path.join(outputDir, path.basename(req.params.name)));
});

export const systemRouter = express.Router();

systemRouter.get("/disk-space", async (_req: Request, res: Response) => {
  const freeBytes = await getFreeDiskSpaceBytes();
  res.json({ freeBytes, freeGb: formatBytesAsGb(freeBytes) });
});
