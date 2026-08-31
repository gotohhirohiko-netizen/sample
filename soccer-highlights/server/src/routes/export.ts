import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import express, { type Request, type Response } from "express";
import { outputDir, projectMusicDir, tmpDir } from "../config.ts";
import { probeMediaDurationSec } from "../lib/audioProbe.ts";
import { assertEnoughDiskSpace, formatBytesAsGb, getFreeDiskSpaceBytes } from "../lib/diskSpace.ts";
import {
  concatClips,
  extractSegmentCopy,
  muxVideoWithAudioFrom,
  probeVideoResolution,
  QUALITY_TARGET_RESOLUTION,
  replaceAudioFromOffset,
  replaceAudioWithMusicTracks,
  trimClip,
} from "../lib/ffmpegPipeline.ts";
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
import { isUuid, sanitizeFileName } from "../lib/sanitize.ts";
import { CancelledError } from "../lib/spawnUtil.ts";
import { ensureVideoDownloaded } from "../lib/ytdlp.ts";
import { VIDEO_QUALITIES, type Clip, type ClipSource, type VideoQuality } from "../types.ts";

function parseQuality(value: unknown): VideoQuality {
  return (VIDEO_QUALITIES as readonly string[]).includes(value as string) ? (value as VideoQuality) : "best";
}

/**
 * ダウンロードキャッシュの削除は、Windowsではffmpegプロセス終了直後にOSがまだ
 * ファイルハンドルを解放しておらず(ウイルス対策ソフトのスキャン等も影響しうる)、
 * 一度目の削除がEBUSY/EPERMで失敗することがある。以前は結果を無視して握りつぶして
 * いたため、失敗しても気づけずファイルが残り続けていた。リトライしつつ、最終的に
 * 失敗した場合はログに残す。
 */
async function deleteWithRetry(
  filePath: string,
  options: { recursive?: boolean } = {},
  attempts = 5,
  delayMs = 400,
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await rm(filePath, { force: true, recursive: options.recursive });
      return;
    } catch (err) {
      if (i === attempts - 1) {
        console.warn(`削除に失敗しました: ${filePath}`, err);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/** ジョブ用の一時作業フォルダ(data/tmp/<jobId>/)を削除する。中に巨大な中間ファイルが
 * 残っていることがあるため、失敗を握りつぶさずリトライ+ログ出力する(deleteWithRetryと同じ理由)。 */
async function deleteJobTmpDir(jobTmpDir: string): Promise<void> {
  await deleteWithRetry(jobTmpDir, { recursive: true });
}

export const exportRouter = express.Router();

interface CombineRequestBody {
  clips: Clip[];
  sources: ClipSource[];
  outputName?: string;
  projectName?: string;
  resume?: boolean;
  quality?: string;
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

exportRouter.post("/apply-audio", async (req: Request, res: Response) => {
  const combinedFile = req.body.combinedFile as string | undefined;
  const outputName = req.body.outputName as string | undefined;
  const musicTrackIds = (req.body.musicTrackIds as string[] | undefined) ?? [];

  if (!combinedFile) {
    res.status(400).json({ error: "combinedFileは必須です" });
    return;
  }
  const projectKey = sanitizeFileName(req.body.projectName as string | undefined);
  if (!projectKey) {
    res.status(400).json({ error: "プロジェクト名は必須です" });
    return;
  }
  if (musicTrackIds.length === 0) {
    res.status(400).json({ error: "mp3を1つ以上指定してください" });
    return;
  }
  if (!musicTrackIds.every((id) => typeof id === "string" && isUuid(id))) {
    res.status(400).json({ error: "不正な音楽トラックIDです" });
    return;
  }

  const combinedPath = path.join(outputDir, path.basename(combinedFile));
  if (!existsSync(combinedPath)) {
    res.status(404).json({ error: "結合済み動画ファイルが見つかりません。書き出しをやり直してください。" });
    return;
  }

  const musicDir = projectMusicDir(projectKey);
  const musicPaths = musicTrackIds.map((id) => path.join(musicDir, `${id}.mp3`));
  const missing = musicPaths.some((p) => !existsSync(p));
  if (missing) {
    res.status(404).json({ error: "音楽ファイルが見つかりません。プロジェクトで音楽を追加し直してください。" });
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

  runApplyAudioPipeline(jobId, combinedPath, musicPaths, outputName).catch((err: unknown) => {
    if (err instanceof CancelledError) return;
    setJobStage(jobId, "error", 100, err instanceof Error ? err.message : String(err));
  });

  res.status(202).json({ jobId });
});

interface ReplaceClipsRequestBody {
  combinedFile?: string;
  clips?: Clip[];
  sources?: ClipSource[];
  clipIds?: string[];
}

/**
 * 結合済み動画のうち指定したクリップ(複数可)だけをダウンロード・切り出しし直して差し替える。
 * 同じ動画を参照するクリップが複数選ばれていても、その動画のダウンロードは1回で済ませる
 * (「同じ動画なら同じ問題が起きている」ケースをまとめて直せるようにするため)。
 * 差し替え対象以外の部分は、既存の結合済み動画から無劣化(-c copy)でそのまま切り出して使い回す。
 */
exportRouter.post("/replace-clips", async (req: Request, res: Response) => {
  const body = req.body as ReplaceClipsRequestBody;
  if (!body.combinedFile || !body.clips?.length || !body.sources || !body.clipIds?.length) {
    res.status(400).json({ error: "combinedFile/clips/sources/clipIdsは必須です" });
    return;
  }

  const combinedPath = path.join(outputDir, path.basename(body.combinedFile));
  if (!existsSync(combinedPath)) {
    res.status(404).json({ error: "結合済み動画ファイルが見つかりません。書き出しをやり直してください。" });
    return;
  }

  const clips = body.clips;
  const sources = body.sources;
  const clipIds = body.clipIds;
  const clipById = new Map(clips.map((c) => [c.id, c]));
  const unknownId = clipIds.find((id) => !clipById.has(id));
  if (unknownId) {
    res
      .status(400)
      .json({ error: "指定されたクリップが見つかりません。クリップ一覧が変わっている可能性があります。" });
    return;
  }

  const sourceByVideoId = new Map(sources.map((s) => [s.videoId, s]));
  const missingVideoId = clipIds
    .map((id) => clipById.get(id)!.sourceVideoId)
    .find((videoId) => !sourceByVideoId.has(videoId));
  if (missingVideoId) {
    res.status(400).json({ error: "クリップが参照する動画が見つかりません。" });
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

  runReplaceClipsPipeline(jobId, combinedPath, clips, new Set(clipIds), sourceByVideoId).catch((err: unknown) => {
    if (err instanceof CancelledError) return;
    setJobStage(jobId, "error", 100, err instanceof Error ? err.message : String(err));
  });

  res.status(202).json({ jobId });
});

interface ReplaceAudioFromRequestBody {
  sourceFile?: string;
  beforeAudioFile?: string;
  cutSec?: number;
  outputName?: string;
  overwriteSource?: boolean;
  projectName?: string;
  musicTrackIds?: string[];
}

/**
 * data/output/内の任意の動画ファイル(sourceFile。クリップ一覧や音楽トラックの記録が
 * 残っていない古い書き出し結果でもよい)について、指定した時点より前はsourceFile自身の
 * 音声(beforeAudioFileが指定されていればそちらの音声)を保ちつつsourceFileの映像を使い、
 * それ以降は映像はsourceFileのまま、音声だけ指定したmp3群に差し替えて新しいファイルとして
 * 書き出す。「複数の曲を1本の動画に適用したら最後の曲が途中で切れてしまった」場合に、
 * 切れている曲の手前で区切って別の曲を差し込み直す、といった用途を想定している。
 * beforeAudioFileは、クリップを追加して動画(sourceFile)を作り直した際、追加前の
 * 動画に既に焼き込んであった音楽をそのまま前半部分に引き継ぎたい場合に指定する
 * (映像は常にsourceFileのものを使う)。
 */
exportRouter.post("/replace-audio-from", async (req: Request, res: Response) => {
  const body = req.body as ReplaceAudioFromRequestBody;
  if (!body.sourceFile || typeof body.cutSec !== "number" || !body.musicTrackIds?.length) {
    res.status(400).json({ error: "sourceFile/cutSec/musicTrackIdsは必須です" });
    return;
  }
  const projectKey = sanitizeFileName(body.projectName);
  if (!projectKey) {
    res.status(400).json({ error: "プロジェクト名は必須です" });
    return;
  }
  if (!body.musicTrackIds.every((id) => isUuid(id))) {
    res.status(400).json({ error: "不正な音楽トラックIDです" });
    return;
  }

  const sourcePath = path.join(outputDir, path.basename(body.sourceFile));
  if (!existsSync(sourcePath)) {
    res.status(404).json({ error: "動画ファイルが見つかりません。" });
    return;
  }

  let beforeAudioPath: string | null = null;
  if (body.beforeAudioFile) {
    beforeAudioPath = path.join(outputDir, path.basename(body.beforeAudioFile));
    if (!existsSync(beforeAudioPath)) {
      res.status(404).json({ error: "音声を引き継ぐ元の動画ファイルが見つかりません。" });
      return;
    }
  }

  const musicDir = projectMusicDir(projectKey);
  const musicPaths = body.musicTrackIds.map((id) => path.join(musicDir, `${id}.mp3`));
  if (musicPaths.some((p) => !existsSync(p))) {
    res.status(404).json({ error: "音楽ファイルが見つかりません。プロジェクトで音楽を追加し直してください。" });
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

  runReplaceAudioFromPipeline(
    jobId,
    sourcePath,
    beforeAudioPath,
    body.cutSec,
    musicPaths,
    Boolean(body.overwriteSource),
    body.outputName,
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
      quality: parseQuality(body.quality),
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
      const sourcePath = await ensureVideoDownloaded(
        paths.downloadsDir,
        source.youtubeUrl,
        videoId,
        meta.quality,
        signal,
      );
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
        await trimClip(
          sourcePath,
          clip.startSec,
          clip.endSec,
          clipOutputPath(paths, clip.id),
          QUALITY_TARGET_RESOLUTION[meta.quality],
          signal,
        );
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
 * mp3自体はプロジェクトの音楽フォルダに既に保存済みのものをそのまま参照するため、
 * ダウンロード・切り出し・結合はもちろん、mp3のアップロードもやり直さない。
 */
async function runApplyAudioPipeline(
  jobId: string,
  combinedPath: string,
  musicPaths: string[],
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
    await deleteJobTmpDir(jobTmpDir);

    setJobStage(jobId, "done", 100, "完了しました");
    const job = getJob(jobId);
    if (job) job.outputFile = outputFile;
  } catch (err) {
    await deleteJobTmpDir(jobTmpDir);
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
 * 結合済み動画のうち指定したクリップ(複数可)だけをダウンロード・切り出しし直し、
 * それ以外の部分は結合済み動画からそのまま(無劣化で)切り出して使い回して結合し直す。
 * クリップは元々1本ずつ独立してエンコードされ、その境界がそのままキーフレームになっているため、
 * クリップの境界で切ってもズレは生じない。新しいクリップは既存の結合済み動画と同じ解像度に
 * 合わせて作るため(ダウンロード自体は常に最高画質で行い、trimClipでその解像度に揃える)、
 * ダウンロード時の画質設定を意識する必要はない。同じ動画を参照するクリップが複数あっても、
 * その動画のダウンロードは1回で済ませる。
 */
async function runReplaceClipsPipeline(
  jobId: string,
  combinedPath: string,
  clips: Clip[],
  targetClipIds: Set<string>,
  sourceByVideoId: Map<string, ClipSource>,
): Promise<void> {
  const jobTmpDir = path.join(tmpDir, jobId);
  await mkdir(jobTmpDir, { recursive: true });

  const controller = new AbortController();
  registerJobController(jobId, controller);
  const { signal } = controller;

  try {
    if (signal.aborted) throw new CancelledError();
    await assertEnoughDiskSpace();

    const targetResolution = await probeVideoResolution(combinedPath);

    // 各クリップの、結合済み動画内でのオフセット・長さを先に計算しておく
    let cursor = 0;
    const clipTimings = clips.map((c) => {
      const offsetSec = cursor;
      cursor += c.endSec - c.startSec;
      return { clip: c, offsetSec, durationSec: c.endSec - c.startSec };
    });

    // 差し替え対象のクリップを、参照する動画ごとにまとめる(同じ動画は1回だけダウンロードする)
    const targetClips = clips.filter((c) => targetClipIds.has(c.id));
    const videoIds = [...new Set(targetClips.map((c) => c.sourceVideoId))];
    const newClipPathById = new Map<string, string>();

    for (let vi = 0; vi < videoIds.length; vi++) {
      if (signal.aborted) throw new CancelledError();
      await assertEnoughDiskSpace();

      const videoId = videoIds[vi];
      const source = sourceByVideoId.get(videoId);
      if (!source) throw new Error(`クリップが参照する動画が見つかりません: ${videoId}`);

      setJobStage(
        jobId,
        "downloading",
        Math.round((vi / videoIds.length) * 50),
        `動画を取得中 (${vi + 1}/${videoIds.length}): ${source.title ?? source.youtubeUrl}`,
      );
      const sourcePath = await ensureVideoDownloaded(jobTmpDir, source.youtubeUrl, videoId, "best", signal);

      const clipsForThisVideo = targetClips.filter((c) => c.sourceVideoId === videoId);
      for (let ci = 0; ci < clipsForThisVideo.length; ci++) {
        if (signal.aborted) throw new CancelledError();
        const clip = clipsForThisVideo[ci];
        setJobStage(
          jobId,
          "trimming",
          Math.round(((vi + ci / clipsForThisVideo.length) / videoIds.length) * 50) + 5,
          `クリップを作り直し中: ${clip.label || "無題"}`,
        );
        const newClipPath = path.join(jobTmpDir, `new-${clip.id}.mp4`);
        await trimClip(sourcePath, clip.startSec, clip.endSec, newClipPath, targetResolution, signal);
        newClipPathById.set(clip.id, newClipPath);
      }
      await deleteWithRetry(sourcePath);
    }

    if (signal.aborted) throw new CancelledError();
    setJobStage(jobId, "concatenating", 80, "結合し直しています...");

    // 全クリップ分のセグメントを元の並び順通りに組み立てる
    // (差し替え対象は作り直したクリップ、それ以外は結合済み動画から無劣化コピー)
    const segments: string[] = [];
    for (let i = 0; i < clipTimings.length; i++) {
      const { clip, offsetSec, durationSec } = clipTimings[i];
      const newPath = newClipPathById.get(clip.id);
      if (newPath) {
        segments.push(newPath);
        continue;
      }
      const keepPath = path.join(jobTmpDir, `keep-${i}.mp4`);
      await extractSegmentCopy(combinedPath, keepPath, { startSec: offsetSec, durationSec }, signal);
      segments.push(keepPath);
    }

    const finalTmpPath = path.join(jobTmpDir, "final.mp4");
    await concatClips(segments, finalTmpPath, jobTmpDir, signal);

    await deleteWithRetry(combinedPath);
    await rename(finalTmpPath, combinedPath);
    await deleteJobTmpDir(jobTmpDir);

    setJobStage(jobId, "done", 100, "クリップを差し替えました");
    const job = getJob(jobId);
    if (job) job.outputFile = path.basename(combinedPath);
  } catch (err) {
    await deleteJobTmpDir(jobTmpDir);
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
 * 任意の動画ファイル(sourcePath)について、cutSecより前は映像はsourcePathのまま・音声は
 * sourcePath自身(beforeAudioPathが指定されていればそちらの音声)を保持し、それ以降は
 * 映像はsourcePathのまま音声だけmusicPathsに差し替えて新しいファイルとして書き出す。
 * cutSec以降は映像を再エンコードしてフレーム精度で切り出すため(-c copyでの入力シークは
 * キーフレーム単位でしかズレなく切れないため)、cutSec未満の部分との結合時にズレは生じない。
 */
async function runReplaceAudioFromPipeline(
  jobId: string,
  sourcePath: string,
  beforeAudioPath: string | null,
  cutSec: number,
  musicPaths: string[],
  overwriteSource: boolean,
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

    const totalDurationSec = await probeMediaDurationSec(sourcePath);
    if (cutSec <= 0 || cutSec >= totalDurationSec) {
      throw new Error(
        `差し替え開始位置が動画の長さの範囲外です(動画の長さ: ${Math.round(totalDurationSec)}秒)`,
      );
    }

    setJobStage(jobId, "trimming", 20, "指定位置より前を保持中...");
    const beforePath = path.join(jobTmpDir, "before.mp4");
    if (beforeAudioPath) {
      await muxVideoWithAudioFrom(sourcePath, beforeAudioPath, cutSec, beforePath, signal);
    } else {
      await extractSegmentCopy(sourcePath, beforePath, { durationSec: cutSec }, signal);
    }

    if (signal.aborted) throw new CancelledError();
    setJobStage(jobId, "applying-audio", 50, "指定位置以降の音声を差し替え中...");
    const afterPath = path.join(jobTmpDir, "after.mp4");
    await replaceAudioFromOffset(sourcePath, cutSec, musicPaths, afterPath, signal);

    if (signal.aborted) throw new CancelledError();
    setJobStage(jobId, "concatenating", 85, "結合しています...");
    const finalTmpPath = path.join(jobTmpDir, "final.mp4");
    await concatClips([beforePath, afterPath], finalTmpPath, jobTmpDir, signal);

    let outputFile: string;
    if (overwriteSource) {
      // ①のファイルサイズをそのまま抑えたい場合、新規ファイルを作らずその場で上書きする。
      outputFile = path.basename(sourcePath);
      await deleteWithRetry(sourcePath);
      await rename(finalTmpPath, sourcePath);
    } else {
      const safeName = sanitizeFileName(outputName) ?? `highlight-audio-fixed-${jobId.slice(0, 8)}`;
      outputFile = `${safeName}.mp4`;
      if (outputFile === path.basename(sourcePath)) {
        throw new Error("出力ファイル名が元の動画と同じです。別の名前を指定してください。");
      }
      await mkdir(outputDir, { recursive: true });
      await rename(finalTmpPath, path.join(outputDir, outputFile));
    }
    await deleteJobTmpDir(jobTmpDir);

    setJobStage(jobId, "done", 100, "完了しました");
    const job = getJob(jobId);
    if (job) job.outputFile = outputFile;
  } catch (err) {
    await deleteJobTmpDir(jobTmpDir);
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
