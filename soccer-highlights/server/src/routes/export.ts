import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
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
  getCancelDeleteCache,
  getJob,
  isPauseRequested,
  registerJobController,
  requestPause,
  setJobStage,
} from "../lib/jobs.ts";
import {
  clearWork,
  clipOutputPath,
  ensureWorkDirs,
  getResumeStatus,
  readWorkMeta,
  sanitizeWorkKey,
  workPathsFor,
  writeWorkMeta,
  type WorkMeta,
} from "../lib/resumableWork.ts";
import { sanitizeFileName } from "../lib/sanitize.ts";
import { CancelledError } from "../lib/spawnUtil.ts";
import { ensureVideoDownloaded } from "../lib/ytdlp.ts";
import type { Clip, ClipSource } from "../types.ts";

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
        console.warn(`ファイルの削除に失敗しました: ${filePath}`, err);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export const exportRouter = express.Router();

interface CombineRequestBody {
  clips: Clip[];
  sources: ClipSource[];
  outputName?: string;
  projectName?: string;
  resume?: boolean;
}

exportRouter.post("/", async (req: Request, res: Response) => {
  const body = req.body as CombineRequestBody;
  if (!body?.resume && !body?.clips?.length) {
    res.status(400).json({ error: "クリップが1つもありません" });
    return;
  }
  const workKey = sanitizeWorkKey(body.projectName);
  if (!workKey) {
    res.status(400).json({ error: "プロジェクト名を設定してください(一時停止・再開に使われます)" });
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

  runCombinePipeline(jobId, workKey, body).catch((err: unknown) => {
    if (err instanceof CancelledError) return; // パイプライン側で既にstage更新済み
    setJobStage(jobId, "error", 100, err instanceof Error ? err.message : String(err));
  });

  res.status(202).json({ jobId });
});

exportRouter.get("/resume-status", async (req: Request, res: Response) => {
  const workKey = sanitizeWorkKey(req.query.projectName as string | undefined);
  if (!workKey) {
    res.json({ resumable: false, totalClips: 0, doneClips: 0 });
    return;
  }
  const status = await getResumeStatus(workPathsFor(workKey));
  res.json(status);
});

exportRouter.post("/:jobId/pause", (req: Request<{ jobId: string }>, res: Response) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "ジョブが見つかりません" });
    return;
  }
  if (job.stage === "done" || job.stage === "error" || job.stage === "cancelled" || job.stage === "paused") {
    res.status(400).json({ error: "このジョブは一時停止できません" });
    return;
  }
  if (!requestPause(req.params.jobId)) {
    res.status(400).json({ error: "一時停止できませんでした" });
    return;
  }
  res.status(202).json({ ok: true });
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
  const deleteCache = Boolean((req.body as { deleteCache?: boolean } | undefined)?.deleteCache);
  if (!cancelJob(req.params.jobId, deleteCache)) {
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
 * プロジェクトごとの作業フォルダ(data/work/<プロジェクト名>/)にダウンロード済み元動画・
 * 切り出し済みクリップを置きながら進めるため、一時停止/キャンセル(保持選択時)/
 * サーバー再起動をまたいでも、続きから再開できる。
 * 結合結果はdata/output/にそのまま残り、あとで/apply-audioから
 * 何度でも音楽を差し替えて書き出せるようにする。
 */
async function runCombinePipeline(jobId: string, workKey: string, body: CombineRequestBody): Promise<void> {
  const paths = workPathsFor(workKey);

  let meta: WorkMeta;
  if (body.resume) {
    const existing = await readWorkMeta(paths);
    if (!existing) throw new Error("再開できる作業が見つかりませんでした。最初から書き出してください。");
    meta = existing;
  } else {
    await clearWork(paths);
    await ensureWorkDirs(paths);
    meta = {
      clips: body.clips,
      sources: body.sources,
      outputName: body.outputName,
      createdAt: Date.now(),
    };
    await writeWorkMeta(paths, meta);
  }
  await ensureWorkDirs(paths);

  const controller = new AbortController();
  registerJobController(jobId, controller);
  const { signal } = controller;

  // catch節で失敗時の後片付けに使う。動画は1本ずつダウンロード→切り出し→削除の順で
  // 処理するため、ダウンロード済みのまま残るのは基本的にこの1本だけ。
  let currentDownloadedPath: string | null = null;

  try {
    const sourceByVideoId = new Map(meta.sources.map((s) => [s.videoId, s]));
    const uniqueVideoIds = [...new Set(meta.clips.map((c) => c.sourceVideoId))];
    const totalClips = meta.clips.length;
    let completedClips = meta.clips.filter((c) => existsSync(clipOutputPath(paths, c.id))).length;

    for (let vi = 0; vi < uniqueVideoIds.length; vi++) {
      const videoId = uniqueVideoIds[vi];
      const clipIndexesForThisVideo = meta.clips
        .map((clip, index) => (clip.sourceVideoId === videoId ? index : -1))
        .filter((index) => index !== -1);
      const remainingIndexes = clipIndexesForThisVideo.filter(
        (index) => !existsSync(clipOutputPath(paths, meta.clips[index].id)),
      );
      if (remainingIndexes.length === 0) continue; // 再開時: この動画は既に全部切り出し済み

      if (signal.aborted) throw new CancelledError();
      await assertEnoughDiskSpace();

      const source = sourceByVideoId.get(videoId);
      if (!source) throw new Error(`クリップが参照する動画が見つかりません: ${videoId}`);

      // 1. この動画をダウンロード(重複はキャッシュ済みならスキップ)
      setJobStage(
        jobId,
        "downloading",
        Math.round((completedClips / totalClips) * 80),
        `元動画を取得中 (${vi + 1}/${uniqueVideoIds.length}): ${source.title ?? source.youtubeUrl}`,
      );
      const sourcePath = await ensureVideoDownloaded(paths.downloadsDir, source.youtubeUrl, videoId, signal);
      currentDownloadedPath = sourcePath;

      if (isPauseRequested(jobId)) {
        setJobStage(
          jobId,
          "paused",
          Math.round((completedClips / totalClips) * 80),
          `一時停止しました(${completedClips}/${totalClips}クリップ完了、この動画のダウンロードは完了済み)`,
        );
        return;
      }

      // 2. この動画を参照する未処理のクリップを、全体の並び順を保ったまま切り出す
      for (const clipIndex of remainingIndexes) {
        if (signal.aborted) throw new CancelledError();
        await assertEnoughDiskSpace();

        const clip = meta.clips[clipIndex];
        setJobStage(
          jobId,
          "trimming",
          Math.round((completedClips / totalClips) * 80),
          `クリップを切り出し中 (${completedClips + 1}/${totalClips}): ${clip.label || "無題"}`,
        );
        await trimClip(sourcePath, clip.startSec, clip.endSec, clipOutputPath(paths, clip.id), signal);
        completedClips++;

        if (isPauseRequested(jobId)) {
          setJobStage(
            jobId,
            "paused",
            Math.round((completedClips / totalClips) * 80),
            `一時停止しました(${completedClips}/${totalClips}クリップ完了)`,
          );
          return;
        }
      }

      // 3. この動画のクリップは全て切り出し終わったので、次の動画に進む前に即削除する
      await deleteWithRetry(sourcePath);
      currentDownloadedPath = null;
    }

    if (signal.aborted) throw new CancelledError();

    // 4. 結合
    setJobStage(jobId, "concatenating", 85, "クリップを結合中...");
    const orderedClipPaths = meta.clips.map((c) => clipOutputPath(paths, c.id));
    const concatenatedPath = path.join(paths.root, "concatenated.mp4");
    await concatClips(orderedClipPaths, concatenatedPath, paths.root, signal);

    // 5. 出力先へ配置(結合済み動画として保存。音声を後から差し替える際に再利用する)
    const safeName = sanitizeFileName(meta.outputName) ?? `highlight-${jobId.slice(0, 8)}`;
    const outputFile = `${safeName}.mp4`;
    await mkdir(outputDir, { recursive: true });
    await rename(concatenatedPath, path.join(outputDir, outputFile));

    // 作業フォルダ(ダウンロード・切り出し済みクリップ等)を片付ける。完了したので再開の必要はない。
    await clearWork(paths);

    setJobStage(jobId, "done", 100, "完了しました");
    const job = getJob(jobId);
    if (job) job.outputFile = outputFile;
  } catch (err) {
    if (err instanceof CancelledError) {
      // キャンセル時点でダウンロード中だった(=不完全な)ファイルは常に削除する。
      if (currentDownloadedPath) await deleteWithRetry(currentDownloadedPath);

      const deleteCache = getCancelDeleteCache(jobId);
      if (deleteCache) {
        await clearWork(paths);
        setJobStage(jobId, "cancelled", 100, "キャンセルしました(ダウンロード済みファイルも削除しました)");
      } else {
        setJobStage(
          jobId,
          "cancelled",
          100,
          "キャンセルしました(ダウンロード・切り出し済みのファイルは保持しています。次回「続きから再開」できます)",
        );
      }
      return;
    }
    if (currentDownloadedPath) await deleteWithRetry(currentDownloadedPath);
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
