import { useEffect, useState } from "react";
import {
  cancelExport,
  getDiskSpace,
  getExportResumeStatus,
  getJobStatus,
  pauseExport,
  startExport,
  type CombinedVideoInfo,
  type ResumeStatus,
} from "../lib/api.ts";
import { VIDEO_QUALITIES, type Clip, type ClipSource, type JobStage, type JobStatus, type VideoQuality } from "../types.ts";
import { YoutubeUploadPanel } from "./YoutubeUploadPanel.tsx";

const qualityLabel: Record<VideoQuality, string> = {
  best: "最高画質(元動画が4Kならそのまま4K)",
  "1080": "1080pまでに制限",
  "720": "720pまでに制限",
};

interface Props {
  clips: Clip[];
  sources: ClipSource[];
  projectName: string;
  onCombinedVideoReady: (info: CombinedVideoInfo) => void;
}

const stageLabel: Record<JobStage, string> = {
  queued: "待機中",
  downloading: "元動画をダウンロード中",
  trimming: "クリップを切り出し中",
  concatenating: "結合中",
  "applying-audio": "音声を適用中",
  done: "完了",
  error: "エラー",
  cancelled: "キャンセルされました",
  paused: "一時停止中",
};

export function ExportPanel({ clips, sources, projectName, onCombinedVideoReady }: Props) {
  const [outputName, setOutputName] = useState("highlight");
  const [quality, setQuality] = useState<VideoQuality>("best");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freeDiskGb, setFreeDiskGb] = useState<string | null>(null);
  const [resumeStatus, setResumeStatus] = useState<ResumeStatus | null>(null);

  const isRunning =
    job !== null &&
    job.stage !== "done" &&
    job.stage !== "error" &&
    job.stage !== "cancelled" &&
    job.stage !== "paused";

  const refreshDiskSpace = () => {
    getDiskSpace()
      .then((info) => setFreeDiskGb(info.freeGb))
      .catch(() => setFreeDiskGb(null));
  };

  const refreshResumeStatus = () => {
    if (!projectName) {
      setResumeStatus(null);
      return;
    }
    getExportResumeStatus(projectName)
      .then(setResumeStatus)
      .catch(() => setResumeStatus(null));
  };

  useEffect(() => {
    refreshDiskSpace();
  }, []);

  useEffect(() => {
    refreshResumeStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectName]);

  useEffect(() => {
    if (!jobId || !isRunning) return;
    const timer = setInterval(() => {
      getJobStatus(jobId)
        .then((data) => {
          setJob(data);
          if (data.stage === "done" || data.stage === "error" || data.stage === "cancelled" || data.stage === "paused") {
            refreshDiskSpace();
            refreshResumeStatus();
          }
          if (data.stage === "done" && data.outputFile) {
            onCombinedVideoReady({
              file: data.outputFile,
              durationSec: clips.reduce((sum, c) => sum + (c.endSec - c.startSec), 0),
              clipCount: clips.length,
              createdAt: Date.now(),
            });
          }
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }, 1500);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, isRunning, clips, onCombinedVideoReady]);

  const handleExport = async () => {
    if (!projectName) return;
    if (resumeStatus?.resumable) {
      const proceed = window.confirm(
        `前回の途中経過(${resumeStatus.doneClips}/${resumeStatus.totalClips}クリップ完了)が残っています。\n` +
          "削除して最初からやり直しますか?\n\n" +
          "続きから再開したい場合は「キャンセル」を押して、下の「続きから再開」ボタンを使ってください。",
      );
      if (!proceed) return;
    }

    setError(null);
    setStarting(true);
    try {
      const { jobId: newJobId } = await startExport(
        clips,
        sources,
        outputName.trim() || "highlight",
        projectName,
        false,
        quality,
      );
      setJobId(newJobId);
      setJob({ id: newJobId, stage: "queued", progress: 0, createdAt: Date.now() });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  };

  const handleResume = async () => {
    if (!projectName) return;
    setError(null);
    setStarting(true);
    try {
      const { jobId: newJobId } = await startExport(
        clips,
        sources,
        outputName.trim() || "highlight",
        projectName,
        true,
        quality,
      );
      setJobId(newJobId);
      setJob({ id: newJobId, stage: "queued", progress: 0, createdAt: Date.now() });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  };

  const handlePause = async () => {
    if (!jobId) return;
    setPausing(true);
    try {
      await pauseExport(jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPausing(false);
    }
  };

  const handleCancel = async () => {
    if (!jobId) return;
    if (!window.confirm("書き出しをキャンセルしますか?")) return;
    const deleteCache = window.confirm(
      "ダウンロード済み・切り出し済みのファイルも削除しますか?\n\n" +
        "「OK」: 削除する(次回は最初からやり直しになります)\n" +
        "「キャンセル」: 保持する(あとで「続きから再開」できます)",
    );
    setCancelling(true);
    try {
      await cancelExport(jobId, deleteCache);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <section className="export-panel">
      <h2>書き出し(切り抜き・結合)</h2>
      <p className="hint">
        ここではクリップの切り抜きと結合のみを行う(音声はそのまま)。音楽を差し替えたい場合は、
        完了後に下の「音楽を追加」で行う。
      </p>

      {freeDiskGb && <p className="hint">PCの空き容量: {freeDiskGb}</p>}

      {!projectName && (
        <p className="error-text">
          左メニューの「プロジェクト」欄でプロジェクト名を設定してください(一時停止・再開の管理に使う)。
        </p>
      )}

      {resumeStatus?.resumable && !isRunning && (
        <div className="resume-banner">
          <p>
            前回の途中経過があります({resumeStatus.doneClips}/{resumeStatus.totalClips}クリップ完了)。
          </p>
          <button type="button" onClick={handleResume} disabled={starting}>
            {starting ? "再開中..." : "続きから再開"}
          </button>
        </div>
      )}

      <label>
        ファイル名
        <input type="text" value={outputName} onChange={(e) => setOutputName(e.target.value)} />
      </label>

      <label>
        画質
        <select value={quality} onChange={(e) => setQuality(e.target.value as VideoQuality)} disabled={isRunning}>
          {VIDEO_QUALITIES.map((q) => (
            <option key={q} value={q}>
              {qualityLabel[q]}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">
        画質が高いほど元動画のダウンロードサイズ・書き出し時間が増える。途中から再開する場合は
        最初に選んだ画質がそのまま使われる。
      </p>

      <div className="export-start-row">
        <button
          type="button"
          onClick={handleExport}
          disabled={starting || clips.length === 0 || isRunning || !projectName}
        >
          {starting ? "開始中..." : "結合して書き出し(ローカル保存)"}
        </button>
        {isRunning && (
          <>
            <button type="button" onClick={handlePause} disabled={pausing}>
              {pausing ? "一時停止をリクエスト中..." : "一時停止"}
            </button>
            <button type="button" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? "キャンセル中..." : "キャンセル"}
            </button>
          </>
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
