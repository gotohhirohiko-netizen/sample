import { useEffect, useState } from "react";
import { cancelExport, getDiskSpace, getJobStatus, startExport } from "../lib/api.ts";
import type { Clip, ClipSource, JobStage, JobStatus } from "../types.ts";
import { YoutubeUploadPanel } from "./YoutubeUploadPanel.tsx";

interface Props {
  clips: Clip[];
  sources: ClipSource[];
}

const stageLabel: Record<JobStage, string> = {
  queued: "待機中",
  downloading: "元動画をダウンロード中",
  trimming: "クリップを切り出し中",
  concatenating: "結合中",
  "applying-audio": "音声を差し替え中",
  done: "完了",
  error: "エラー",
  cancelled: "キャンセルされました",
};

export function ExportPanel({ clips, sources }: Props) {
  const [outputName, setOutputName] = useState("highlight");
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freeDiskGb, setFreeDiskGb] = useState<string | null>(null);

  const isRunning =
    job !== null && job.stage !== "done" && job.stage !== "error" && job.stage !== "cancelled";

  const refreshDiskSpace = () => {
    getDiskSpace()
      .then((info) => setFreeDiskGb(info.freeGb))
      .catch(() => setFreeDiskGb(null));
  };

  useEffect(() => {
    refreshDiskSpace();
  }, []);

  useEffect(() => {
    if (!jobId || !isRunning) return;
    const timer = setInterval(() => {
      getJobStatus(jobId)
        .then((data) => {
          setJob(data);
          if (data.stage === "done" || data.stage === "error" || data.stage === "cancelled") {
            refreshDiskSpace();
          }
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }, 1500);
    return () => clearInterval(timer);
  }, [jobId, isRunning]);

  const handleExport = async () => {
    setError(null);
    setStarting(true);
    try {
      const { jobId: newJobId } = await startExport(
        clips,
        sources,
        outputName.trim() || "highlight",
        musicFile,
      );
      setJobId(newJobId);
      setJob({ id: newJobId, stage: "queued", progress: 0, createdAt: Date.now() });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  };

  const handleCancel = async () => {
    if (!jobId) return;
    if (!window.confirm("書き出しをキャンセルしますか?ここまでの処理内容は破棄されます。")) return;
    setCancelling(true);
    try {
      await cancelExport(jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <section className="export-panel">
      <h2>書き出し</h2>

      {freeDiskGb && <p className="hint">PCの空き容量: {freeDiskGb}</p>}

      <label>
        ファイル名
        <input type="text" value={outputName} onChange={(e) => setOutputName(e.target.value)} />
      </label>

      <label>
        音楽で音声を上書き(mp3・任意)
        <input
          type="file"
          accept="audio/mpeg,.mp3"
          onChange={(e) => setMusicFile(e.target.files?.[0] ?? null)}
        />
      </label>

      <div className="export-start-row">
        <button type="button" onClick={handleExport} disabled={starting || clips.length === 0 || isRunning}>
          {starting ? "開始中..." : "書き出し開始(ローカル保存)"}
        </button>
        {isRunning && (
          <button type="button" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? "キャンセル中..." : "キャンセル"}
          </button>
        )}
      </div>

      {clips.length === 0 && <p className="hint">クリップを1つ以上追加してから書き出してください。</p>}

      {error && <p className="error-text">{error}</p>}

      {job && (
        <div className="job-status">
          <progress value={job.progress} max={100} />
          <p>
            {stageLabel[job.stage]}
            {job.message ? ` - ${job.message}` : ""}
          </p>
          {job.stage === "error" && <p className="error-text">{job.error}</p>}
          {job.stage === "done" && job.outputFile && (
            <>
              <p>
                ローカル保存先: <code>soccer-highlights/data/output/{job.outputFile}</code>{" "}
                <a href={`/api/export/${jobId}/download`}>ダウンロード</a>
              </p>
              <YoutubeUploadPanel outputFile={job.outputFile} defaultTitle={outputName} />
            </>
          )}
        </div>
      )}
    </section>
  );
}
