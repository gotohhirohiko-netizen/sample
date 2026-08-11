import { useEffect, useState } from "react";
import { getJobStatus, startExport } from "../lib/api.ts";
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
};

export function ExportPanel({ clips, sources }: Props) {
  const [outputName, setOutputName] = useState("highlight");
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRunning = job !== null && job.stage !== "done" && job.stage !== "error";

  useEffect(() => {
    if (!jobId || !isRunning) return;
    const timer = setInterval(() => {
      getJobStatus(jobId)
        .then(setJob)
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

  return (
    <section className="export-panel">
      <h2>書き出し</h2>

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

      <button type="button" onClick={handleExport} disabled={starting || clips.length === 0 || isRunning}>
        {starting ? "開始中..." : "書き出し開始(ローカル保存)"}
      </button>

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
