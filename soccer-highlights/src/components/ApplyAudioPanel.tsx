import { useEffect, useRef, useState } from "react";
import {
  applyAudioTracks,
  cancelExport,
  extractAudioFromYoutube,
  getJobStatus,
  type CombinedVideoInfo,
} from "../lib/api.ts";
import { probeAudioDuration } from "../lib/audioProbe.ts";
import { formatTime } from "../lib/format.ts";
import type { Clip, JobStage, JobStatus } from "../types.ts";
import { YoutubeUploadPanel } from "./YoutubeUploadPanel.tsx";

interface MusicTrack {
  id: string;
  file: File;
  durationSec: number;
}

interface Props {
  combinedVideo: CombinedVideoInfo | null;
  clips: Clip[];
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

function defaultOutputName(combinedFile: string): string {
  return `${combinedFile.replace(/\.mp4$/i, "")}-with-music`;
}

export function ApplyAudioPanel({ combinedVideo, clips }: Props) {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [outputName, setOutputName] = useState(() =>
    combinedVideo ? defaultOutputName(combinedVideo.file) : "highlight-with-music",
  );
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isRunning =
    job !== null && job.stage !== "done" && job.stage !== "error" && job.stage !== "cancelled";

  useEffect(() => {
    if (combinedVideo) setOutputName(defaultOutputName(combinedVideo.file));
  }, [combinedVideo]);

  useEffect(() => {
    if (!jobId || !isRunning) return;
    const timer = setInterval(() => {
      getJobStatus(jobId)
        .then(setJob)
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }, 1500);
    return () => clearInterval(timer);
  }, [jobId, isRunning]);

  if (!combinedVideo) {
    return (
      <section className="apply-audio-panel">
        <h2>音楽を追加</h2>
        <p className="hint">先に上の「書き出し」でクリップを結合すると、ここで音楽を追加できるようになる。</p>
      </section>
    );
  }

  const currentClipsDurationSec = clips.reduce((sum, c) => sum + (c.endSec - c.startSec), 0);
  const isStale =
    clips.length !== combinedVideo.clipCount ||
    Math.abs(currentClipsDurationSec - combinedVideo.durationSec) > 1;

  const addTracksFromFiles = async (files: File[]) => {
    const newTracks: MusicTrack[] = [];
    for (const file of files) {
      const durationSec = await probeAudioDuration(file);
      newTracks.push({ id: crypto.randomUUID(), file, durationSec });
    }
    setTracks((prev) => [...prev, ...newTracks]);
  };

  const handleAddFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    try {
      await addTracksFromFiles(Array.from(fileList));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleExtractFromYoutube = async () => {
    const url = youtubeUrl.trim();
    if (!url) return;
    setError(null);
    setExtracting(true);
    try {
      const file = await extractAudioFromYoutube(url);
      await addTracksFromFiles([file]);
      setYoutubeUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExtracting(false);
    }
  };

  const handleRemoveTrack = (id: string) => setTracks((prev) => prev.filter((t) => t.id !== id));

  const handleReorderTrack = (fromIndex: number, toIndex: number) => {
    setTracks((prev) => {
      if (toIndex < 0 || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const totalMusicSec = tracks.reduce((sum, t) => sum + t.durationSec, 0);
  const diffSec = totalMusicSec - combinedVideo.durationSec;
  const isEnough = diffSec >= 0;

  const handleApply = async () => {
    if (tracks.length === 0) return;
    setError(null);
    setStarting(true);
    try {
      const { jobId: newJobId } = await applyAudioTracks(
        combinedVideo.file,
        outputName.trim() || "highlight-with-music",
        tracks.map((t) => t.file),
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
      <h2>音楽を追加</h2>

      <p className="hint">
        結合済み動画: <code>{combinedVideo.file}</code>({formatTime(combinedVideo.durationSec)}、
        {combinedVideo.clipCount}クリップ)
      </p>
      {isStale && (
        <p className="error-text">
          クリップ一覧がこの結合済み動画から変更されている。反映するには「書き出し」をやり直すこと。
        </p>
      )}

      <label>
        mp3を追加(複数選択可・追加した順に連結される)
        <input
          type="file"
          accept="audio/mpeg,.mp3"
          multiple
          ref={fileInputRef}
          onChange={(e) => void handleAddFiles(e.target.files)}
        />
      </label>

      <label>
        YouTube動画から音声を抽出して追加
        <div className="youtube-audio-extract-row">
          <input
            type="text"
            placeholder="https://www.youtube.com/watch?v=..."
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            disabled={extracting}
          />
          <button type="button" onClick={() => void handleExtractFromYoutube()} disabled={extracting || !youtubeUrl.trim()}>
            {extracting ? "抽出中..." : "抽出して追加"}
          </button>
        </div>
      </label>

      {tracks.length > 0 && (
        <ol className="music-track-list">
          {tracks.map((t, i) => (
            <li key={t.id} className="music-track-row">
              <span className="music-track-name">
                {i + 1}. {t.file.name}
              </span>
              <span className="music-track-duration">{formatTime(t.durationSec)}</span>
              <div className="clip-actions">
                <button type="button" onClick={() => handleReorderTrack(i, i - 1)} disabled={i === 0}>
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => handleReorderTrack(i, i + 1)}
                  disabled={i === tracks.length - 1}
                >
                  ↓
                </button>
                <button type="button" onClick={() => handleRemoveTrack(t.id)}>
                  削除
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className={isEnough ? "music-coverage ok" : "music-coverage insufficient"}>
        音楽合計 {formatTime(totalMusicSec)} / 動画 {formatTime(combinedVideo.durationSec)}
        {tracks.length === 0
          ? ""
          : isEnough
            ? ` — 足りている(余り ${formatTime(diffSec)})`
            : ` — 不足している(あと ${formatTime(-diffSec)} 必要。足りない分は無音になる)`}
      </p>

      <label>
        書き出しファイル名
        <input type="text" value={outputName} onChange={(e) => setOutputName(e.target.value)} />
      </label>

      <div className="export-start-row">
        <button type="button" onClick={handleApply} disabled={starting || tracks.length === 0 || isRunning}>
          {starting ? "開始中..." : "音声を適用して書き出し"}
        </button>
        {isRunning && (
          <button type="button" onClick={handleCancel} disabled={cancelling}>
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
