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
  const [beforeAudioFile, setBeforeAudioFile] = useState("");
  const [cutTimeText, setCutTimeText] = useState("");
  const [overwriteSource, setOverwriteSource] = useState(false);
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
    if (overwriteSource) {
      const proceed = window.confirm(
        `「${selectedFile}」をこの結果で上書きします。元のファイルの内容は失われます。よろしいですか?`,
      );
      if (!proceed) return;
    }
    setError(null);
    setStarting(true);
    try {
      const { jobId: newJobId } = await replaceAudioFrom(
        selectedFile,
        beforeAudioFile || null,
        cutSec,
        projectName,
        musicTracks.map((t) => t.id),
        overwriteSource,
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
        映像は常に①の動画のものを使う。指定した時点より前の音声は①自身のもの(②を指定すればそちらの音声)を
        保ち、それ以降だけ上の「音楽を追加」欄に現在並んでいる曲(③・この並び順)に差し替えて、新しいファイルとして
        書き出す。クリップを追加して動画を作り直したが、前半部分は以前選んだ音楽をそのまま使いたい、
        といった場合に②を指定する(映像は常に①が使われ、②の映像は使われない)。
      </p>

      <label>
        ① 映像のベースにする動画ファイル
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
        ② 指定時点より前の音声を引き継ぐ動画ファイル(省略可・省略時は①自身の音声を使う)
        <select
          value={beforeAudioFile}
          onChange={(e) => setBeforeAudioFile(e.target.value)}
          disabled={isRunning}
        >
          <option value="">(指定しない。①自身の音声を使う)</option>
          {outputs.map((o) => (
            <option key={o.name} value={o.name}>
              {o.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        この時点(mm:ss)より後を③の音楽に差し替える
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

      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={overwriteSource}
          onChange={(e) => setOverwriteSource(e.target.checked)}
          disabled={isRunning}
        />
        ①のファイルをこの結果で上書きする(新しいファイルを作らずディスク使用量を抑える。元のファイルの
        内容は失われる)
      </label>

      {!overwriteSource && (
        <label>
          書き出しファイル名
          <input
            type="text"
            value={outputName}
            onChange={(e) => setOutputName(e.target.value)}
            disabled={isRunning}
          />
        </label>
      )}

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
