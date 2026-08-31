import { useEffect, useState } from "react";
import {
  cancelExport,
  getJobStatus,
  listOutputs,
  replaceAudioFrom,
  type OutputFile,
} from "../lib/api.ts";
import { parseTime } from "../lib/format.ts";
import type { JobStage, JobStatus, MusicTrackMeta } from "../types.ts";

interface Props {
  projectName: string;
  musicTracks: MusicTrackMeta[];
}

const stageLabel: Record<JobStage, string> = {
  queued: "待機中",
  downloading: "取得中",
  trimming: "指定位置より前を保持中",
  concatenating: "結合中",
  "applying-audio": "音声を差し替え中",
  done: "完了",
  error: "エラー",
  cancelled: "キャンセルされました",
  paused: "一時停止中",
};

export function ReplaceAudioFromPanel({ projectName, musicTracks }: Props) {
  const [outputs, setOutputs] = useState<OutputFile[]>([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [cutTimeText, setCutTimeText] = useState("");
  const [outputName, setOutputName] = useState("highlight-audio-fixed");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRunning =
    job !== null && job.stage !== "done" && job.stage !== "error" && job.stage !== "cancelled";

  useEffect(() => {
    listOutputs()
      .then(setOutputs)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    if (!jobId || !isRunning) return;
    const timer = setInterval(() => {
      getJobStatus(jobId)
        .then(setJob)
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }, 1500);
    return () => clearInterval(timer);
  }, [jobId, isRunning]);

  if (musicTracks.length === 0) {
    // 差し替えに使う曲がまだない場合は、上の「音楽を追加」で追加してもらう。
    return null;
  }

  const cutSec = parseTime(cutTimeText);

  const handleSubmit = async () => {
    if (!selectedFile || cutSec === null || !projectName || isRunning) return;
    setError(null);
    setStarting(true);
    try {
      const { jobId: newJobId } = await replaceAudioFrom(
        selectedFile,
        cutSec,
        projectName,
        musicTracks.map((t) => t.id),
        outputName.trim() || "highlight-audio-fixed",
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
    if (!window.confirm("処理をキャンセルしますか?")) return;
    setCancelling(true);
    try {
      await cancelExport(jobId, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <section className="apply-audio-panel">
      <h2>既存の動画の音声を途中から差し替える</h2>
      <p className="hint">
        クリップ一覧や当時の音楽トラックの記録が残っていない古い書き出し済み動画でも、指定した時点より前は
        そのまま保持し、それ以降だけ上の「音楽を追加」欄に現在並んでいる曲(この並び順)に差し替えて
        新しいファイルとして書き出せる。曲の途中で切れてしまった動画の、切れる手前で区切って別の曲を
        差し込み直す、といった用途に使う。
      </p>

      <label>
        対象の動画ファイル
        <select value={selectedFile} onChange={(e) => setSelectedFile(e.target.value)} disabled={isRunning}>
          <option value="">選択してください</option>
          {outputs.map((o) => (
            <option key={o.name} value={o.name}>
              {o.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        この時点(mm:ss)より後を音楽に差し替える
        <input
          type="text"
          placeholder="例: 25:30"
          value={cutTimeText}
          onChange={(e) => setCutTimeText(e.target.value)}
          disabled={isRunning}
        />
      </label>
      {cutTimeText.trim() !== "" && cutSec === null && (
        <p className="error-text">時間の形式が不正(mm:ss または h:mm:ss で入力)</p>
      )}

      <label>
        書き出しファイル名
        <input
          type="text"
          value={outputName}
          onChange={(e) => setOutputName(e.target.value)}
          disabled={isRunning}
        />
      </label>

      <div className="export-start-row">
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={starting || isRunning || !selectedFile || cutSec === null}
        >
          {starting ? "開始中..." : "この時点から音声を差し替えて書き出し"}
        </button>
        {isRunning && (
          <button type="button" onClick={() => void handleCancel()} disabled={cancelling}>
            {cancelling ? "キャンセル中..." : "キャンセル"}
          </button>
        )}
      </div>

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
            <p>
              ローカル保存先: <code>soccer-highlights/data/output/{job.outputFile}</code>{" "}
              <a href={`/api/export/${jobId}/download`}>ダウンロード</a>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
