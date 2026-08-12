import type { JobStage, JobStatus } from "../types.ts";

const jobs = new Map<string, JobStatus>();

interface JobController {
  controller: AbortController;
  pauseRequested: boolean;
  cancelDeleteCache: boolean;
}

const controllers = new Map<string, JobController>();

export function registerJobController(id: string, controller: AbortController): void {
  controllers.set(id, { controller, pauseRequested: false, cancelDeleteCache: false });
}

export function clearJobController(id: string): void {
  controllers.delete(id);
}

/**
 * 実行中のジョブをキャンセルする。deleteCacheがtrueなら、パイプライン側で
 * ダウンロード済みファイル等の作業データも削除する(falseなら再開用に残す)。
 * 対象が見つからない/既に終わっていればfalseを返す。
 */
export function cancelJob(id: string, deleteCache: boolean): boolean {
  const entry = controllers.get(id);
  if (!entry) return false;
  entry.cancelDeleteCache = deleteCache;
  entry.controller.abort();
  return true;
}

export function getCancelDeleteCache(id: string): boolean {
  return controllers.get(id)?.cancelDeleteCache ?? false;
}

/**
 * 一時停止をリクエストする。強制終了はせず、パイプライン側が
 * 動画のダウンロード完了・クリップの切り出し完了などキリのいい時点で
 * このフラグを見て、自ら安全に停止する。
 */
export function requestPause(id: string): boolean {
  const entry = controllers.get(id);
  if (!entry) return false;
  entry.pauseRequested = true;
  return true;
}

export function isPauseRequested(id: string): boolean {
  return controllers.get(id)?.pauseRequested ?? false;
}

export function createJob(id: string): JobStatus {
  const job: JobStatus = { id, stage: "queued", progress: 0, createdAt: Date.now() };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): JobStatus | undefined {
  return jobs.get(id);
}

export function updateJob(
  id: string,
  patch: Partial<Pick<JobStatus, "stage" | "progress" | "message" | "outputFile" | "error">>,
): void {
  const current = jobs.get(id);
  if (!current) return;
  jobs.set(id, { ...current, ...patch });
}

export function setJobStage(id: string, stage: JobStage, progress: number, message?: string): void {
  updateJob(id, { stage, progress, message });
}

// 古いジョブ(1日以上前)をメモリから間引く。作業データ自体は消さない。
setInterval(
  () => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [id, job] of jobs) {
      if (job.createdAt < cutoff) jobs.delete(id);
    }
  },
  60 * 60 * 1000,
).unref();
