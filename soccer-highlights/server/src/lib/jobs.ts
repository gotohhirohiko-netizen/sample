import type { JobStage, JobStatus } from "../types.ts";

const jobs = new Map<string, JobStatus>();
const controllers = new Map<string, AbortController>();

export function registerJobController(id: string, controller: AbortController): void {
  controllers.set(id, controller);
}

export function clearJobController(id: string): void {
  controllers.delete(id);
}

/** 実行中のジョブをキャンセルする。対象が見つからない/既に終わっていればfalseを返す。 */
export function cancelJob(id: string): boolean {
  const controller = controllers.get(id);
  if (!controller) return false;
  controller.abort();
  return true;
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

// 古いジョブ(1日以上前)をメモリから間引く。ダウンロード済みファイル自体は消さない。
setInterval(
  () => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [id, job] of jobs) {
      if (job.createdAt < cutoff) jobs.delete(id);
    }
  },
  60 * 60 * 1000,
).unref();
