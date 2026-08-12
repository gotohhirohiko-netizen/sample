import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import express, { type Request, type Response } from "express";
import multer from "multer";
import { outputDir, tmpDir } from "../config.ts";
import { assertEnoughDiskSpace, formatBytesAsGb, getFreeDiskSpaceBytes } from "../lib/diskSpace.ts";
import { concatClips, replaceAudioWithMusicTracks, trimClip } from "../lib/ffmpegPipeline.ts";
import {
  cancelJob,
  clearJobController,
  createJob,
  getJob,
  registerJobController,
  setJobStage,
} from "../lib/jobs.ts";
import { sanitizeFileName } from "../lib/sanitize.ts";
import { CancelledError } from "../lib/spawnUtil.ts";
import { ensureVideoDownloaded } from "../lib/ytdlp.ts";
import type { ExportRequestPayload } from "../types.ts";

const musicUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

/**
 * ダウンロードキャッシュの削除は、Windowsではffmpegプロセス終了直後にOSがまだ
 * ファイルハンドルを解放しておらず(ウイルス対策ソフトのスキャン等も影響しうる)、
 * 一度目の削除がEBUSY/EPERMで失敗することがある。以前は結果を無視して握りつぶして
 * いたため、失敗しても気づけずファイルが残り続けていた。リトライしつつ、最終的に
 * 失敗した場合はログに残す。
 */
async function deleteWithRetry(filePath: string, attempts = 5, delayMs = 400): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await rm(filePath, { force: true });
      return;
    } catch (err) {
      if (i === attempts - 1) {
        console.warn(`ダウンロードキャッシュの削除に失敗しました: ${filePath}`, err);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export const exportRouter = express.Router();

exportRouter.post("/", async (req: Request, res: Response) => {
  const payload = req.body as ExportRequestPayload;
  if (!payload?.clips?.length) {
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

  runExportPipeline(jobId, payload).catch((err: unknown) => {
    if (err instanceof CancelledError) return; // runExportPipeline側で既にstage更新済み
    setJobStage(jobId, "error", 100, err instanceof Error ? err.message : String(err));
  });

  res.status(202).json({ jobId });
});

exportRouter.post("/apply-audio", musicUpload.array("music"), async (req: Request, res: Response) => {
  const combinedFile = req.body.combinedFile as string | undefined;
  const outputName = req.body.outputName as string | undefined;
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];

  if (!combinedFile) {
    res.status(400).json({ error: "combinedFileは必須です" });
    return;
  }
  if (files.length === 0) {
    res.status(400).json({ error: "mp3ファイルを1つ以上指定してください" });
    return;
  }

  const combinedPath = path.join(outputDir, path.basename(combinedFile));
  if (!existsSync(combinedPath)) {
    res.status(404).json({ error: "結合済み動画ファイルが見つかりません。書き出しをやり直してください。" });
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

  runApplyAudioPipeline(
    jobId,
    combinedPath,
    files.map((f) => f.buffer),
    outputName,
  ).catch((err: unknown) => {
    if (err instanceof CancelledError) return;
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

/**
 * クリップの切り抜き・結合のみを行う(音声の差し替えは行わない)。
 * 結合結果はdata/output/にそのまま残り、あとで/apply-audioから
 * 何度でも音楽を差し替えて書き出せるようにする。
 */
async function runExportPipeline(jobId: string, payload: ExportRequestPayload): Promise<void> {
  const jobTmpDir = path.join(tmpDir, jobId);
  await mkdir(jobTmpDir, { recursive: true });

  const controller = new AbortController();
  registerJobController(jobId, controller);
  const { signal } = controller;

  // catch節で失敗時の後片付けに使うため、tryの外で宣言しておく。
  // 動画は1本ずつダウンロード→切り出し→削除の順で処理するため、同時にダウンロード済みで
  // 残っているのは基本的にこの1本だけ(複数動画を先に全部ダウンロードしてから切り出す方式だと、
  // 動画数が多いとダウンロード段階だけでディスクを使い切ってしまうため、この順序にしている)。
  let currentDownloadedPath: string | null = null;

  try {
    const sourceByVideoId = new Map(payload.sources.map((s) => [s.videoId, s]));
    const uniqueVideoIds = [...new Set(payload.clips.map((c) => c.sourceVideoId))];
    const clipPaths: string[] = new Array(payload.clips.length);
    const totalClips = payload.clips.length;
    let completedClips = 0;

    for (let vi = 0; vi < uniqueVideoIds.length; vi++) {
      if (signal.aborted) throw new CancelledError();
      await assertEnoughDiskSpace();

      const videoId = uniqueVideoIds[vi];
      const source = sourceByVideoId.get(videoId);
      if (!source) throw new Error(`クリップが参照する動画が見つかりません: ${videoId}`);

      // 1. この動画をダウンロード(重複はキャッシュ済みならスキップ)
      setJobStage(
        jobId,
        "downloading",
        Math.round((completedClips / totalClips) * 80),
        `元動画を取得中 (${vi + 1}/${uniqueVideoIds.length}): ${source.title ?? source.youtubeUrl}`,
      );
      const sourcePath = await ensureVideoDownloaded(source.youtubeUrl, videoId, signal);
      currentDownloadedPath = sourcePath;

      // 2. この動画を参照するクリップだけを、全体の並び順を保ったまま切り出す
      const clipIndexesForThisVideo = payload.clips
        .map((clip, index) => (clip.sourceVideoId === videoId ? index : -1))
        .filter((index) => index !== -1);

      for (const clipIndex of clipIndexesForThisVideo) {
        if (signal.aborted) throw new CancelledError();
        await assertEnoughDiskSpace();

        const clip = payload.clips[clipIndex];
        setJobStage(
          jobId,
          "trimming",
          Math.round((completedClips / totalClips) * 80),
          `クリップを切り出し中 (${completedClips + 1}/${totalClips}): ${clip.label || "無題"}`,
        );
        const clipOutPath = path.join(jobTmpDir, `clip-${clipIndex}.mp4`);
        await trimClip(sourcePath, clip.startSec, clip.endSec, clipOutPath, signal);
        clipPaths[clipIndex] = clipOutPath;
        completedClips++;
      }

      // 3. この動画のクリップは全て切り出し終わったので、次の動画に進む前に即削除する
      await deleteWithRetry(sourcePath);
      currentDownloadedPath = null;
    }

    if (signal.aborted) throw new CancelledError();

    // 4. 結合
    setJobStage(jobId, "concatenating", 85, "クリップを結合中...");
    const concatenatedPath = path.join(jobTmpDir, "concatenated.mp4");
    await concatClips(clipPaths, concatenatedPath, jobTmpDir, signal);

    // 5. 出力先へ配置(結合済み動画として保存。音声を後から差し替える際に再利用する)
    const safeName = sanitizeFileName(payload.outputName) ?? `highlight-${jobId.slice(0, 8)}`;
    const outputFile = `${safeName}.mp4`;
    await mkdir(outputDir, { recursive: true });
    await rename(concatenatedPath, path.join(outputDir, outputFile));

    // 中間ファイル(切り出し済みクリップ等)を削除。元動画のダウンロードキャッシュは
    // 上のループで既に不要になった時点で削除済み。
    await rm(jobTmpDir, { recursive: true, force: true });

    setJobStage(jobId, "done", 100, "完了しました");
    const job = getJob(jobId);
    if (job) job.outputFile = outputFile;
  } catch (err) {
    // 失敗・キャンセル時は、このジョブでダウンロードしたまま未削除の元動画(あれば1本のみ)と
    // 一時ファイルを片付ける(やり直す際は再ダウンロードされるため残す意味がない)。
    if (currentDownloadedPath) {
      await deleteWithRetry(currentDownloadedPath);
    }
    await rm(jobTmpDir, { recursive: true, force: true }).catch(() => {});

    if (err instanceof CancelledError) {
      setJobStage(jobId, "cancelled", 100, "キャンセルされました");
      return;
    }
    throw err;
  } finally {
    clearJobController(jobId);
  }
}

/**
 * 既に結合済みの動画に、複数のmp3(指定順に連結)を音声トラックとして適用する。
 * ダウンロード・切り出し・結合はやり直さないため、通常の書き出しよりずっと速い。
 */
async function runApplyAudioPipeline(
  jobId: string,
  combinedPath: string,
  musicBuffers: Buffer[],
  outputName: string | undefined,
): Promise<void> {
  const jobTmpDir = path.join(tmpDir, jobId);
  await mkdir(jobTmpDir, { recursive: true });

  const controller = new AbortController();
  registerJobController(jobId, controller);
  const { signal } = controller;

  try {
    if (signal.aborted) throw new CancelledError();
    await assertEnoughDiskSpace();

    setJobStage(jobId, "applying-audio", 20, "音声ファイルを準備中...");
    const musicPaths: string[] = [];
    for (let i = 0; i < musicBuffers.length; i++) {
      const musicPath = path.join(jobTmpDir, `music-${i}.mp3`);
      await writeFile(musicPath, musicBuffers[i]);
      musicPaths.push(musicPath);
    }

    if (signal.aborted) throw new CancelledError();
    setJobStage(jobId, "applying-audio", 50, "音声を適用中...");
    const finalTmpPath = path.join(jobTmpDir, "final.mp4");
    await replaceAudioWithMusicTracks(combinedPath, musicPaths, finalTmpPath, signal);

    const safeName = sanitizeFileName(outputName) ?? `highlight-with-music-${jobId.slice(0, 8)}`;
    const outputFile = `${safeName}.mp4`;
    if (outputFile === path.basename(combinedPath)) {
      throw new Error("出力ファイル名が結合済み動画と同じです。別の名前を指定してください。");
    }

    await mkdir(outputDir, { recursive: true });
    await rename(finalTmpPath, path.join(outputDir, outputFile));
    await rm(jobTmpDir, { recursive: true, force: true });

    setJobStage(jobId, "done", 100, "完了しました");
    const job = getJob(jobId);
    if (job) job.outputFile = outputFile;
  } catch (err) {
    await rm(jobTmpDir, { recursive: true, force: true }).catch(() => {});
    if (err instanceof CancelledError) {
      setJobStage(jobId, "cancelled", 100, "キャンセルされました");
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
