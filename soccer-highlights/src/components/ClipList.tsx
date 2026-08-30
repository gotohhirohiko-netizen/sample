import { useEffect, useState, type FocusEvent, type KeyboardEvent } from "react";
import { cancelExport, getJobStatus, replaceClip, type CombinedVideoInfo } from "../lib/api.ts";
import { formatTime, parseTime } from "../lib/format.ts";
import type { Clip, ClipSource, JobStage, JobStatus } from "../types.ts";

interface Props {
  clips: Clip[];
  sources: ClipSource[];
  combinedVideo: CombinedVideoInfo | null;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRemove: (id: string) => void;
  onSeek: (clip: Clip) => void;
  onRelabel: (id: string, label: string) => void;
  onUpdateTime: (id: string, field: "start" | "end", seconds: number) => void;
  onRefreshSourceTitle: (videoId: string) => void;
  refreshingSourceVideoId: string | null;
}

const replaceStageLabel: Record<JobStage, string> = {
  queued: "待機中",
  downloading: "動画取得中",
  trimming: "作り直し中",
  concatenating: "結合中",
  "applying-audio": "処理中",
  done: "完了",
  error: "エラー",
  cancelled: "キャンセル済み",
  paused: "一時停止中",
};

function commitOnEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter") e.currentTarget.blur();
}

export function ClipList({
  clips,
  sources,
  combinedVideo,
  onReorder,
  onRemove,
  onSeek,
  onRelabel,
  onUpdateTime,
  onRefreshSourceTitle,
  refreshingSourceVideoId,
}: Props) {
  const [replacingClipId, setReplacingClipId] = useState<string | null>(null);
  const [replaceJobId, setReplaceJobId] = useState<string | null>(null);
  const [replaceJob, setReplaceJob] = useState<JobStatus | null>(null);
  const [replaceError, setReplaceError] = useState<string | null>(null);

  const isReplaceRunning =
    replaceJob !== null &&
    replaceJob.stage !== "done" &&
    replaceJob.stage !== "error" &&
    replaceJob.stage !== "cancelled";

  useEffect(() => {
    if (!replaceJobId || !isReplaceRunning) return;
    const timer = setInterval(() => {
      getJobStatus(replaceJobId)
        .then(setReplaceJob)
        .catch((err) => setReplaceError(err instanceof Error ? err.message : String(err)));
    }, 1500);
    return () => clearInterval(timer);
  }, [replaceJobId, isReplaceRunning]);

  // 完了・エラー・キャンセルのいずれかに達したら、ボタンの状態を元に戻す。
  // 成功時は少し表示してから戻し、エラー時はメッセージを残したまま即座に戻す。
  useEffect(() => {
    if (!replaceJobId || isReplaceRunning || !replaceJob) return;
    if (replaceJob.stage === "error") {
      setReplaceError(replaceJob.error ?? "エラーが発生しました");
      setReplacingClipId(null);
      setReplaceJobId(null);
      setReplaceJob(null);
      return;
    }
    if (replaceJob.stage === "cancelled") {
      setReplacingClipId(null);
      setReplaceJobId(null);
      setReplaceJob(null);
      return;
    }
    const timer = setTimeout(() => {
      setReplacingClipId(null);
      setReplaceJobId(null);
      setReplaceJob(null);
    }, 1500);
    return () => clearTimeout(timer);
  }, [replaceJobId, isReplaceRunning, replaceJob]);

  if (clips.length === 0) {
    return <p className="empty-hint">まだクリップがありません。動画を再生しながら区間を追加してください。</p>;
  }

  const titleFor = (videoId: string) => sources.find((s) => s.videoId === videoId)?.title ?? videoId;

  const handleTimeBlur = (e: FocusEvent<HTMLInputElement>, clip: Clip, field: "start" | "end") => {
    const parsed = parseTime(e.target.value);
    const fallback = field === "start" ? clip.startSec : clip.endSec;
    const other = field === "start" ? clip.endSec : clip.startSec;
    const valid = parsed !== null && (field === "start" ? parsed < other : parsed > other);

    if (!valid) {
      e.target.value = formatTime(fallback);
      return;
    }
    onUpdateTime(clip.id, field, parsed);
  };

  const handleMoveBlur = (e: FocusEvent<HTMLInputElement>, fromIndex: number) => {
    const target = Number(e.target.value);
    if (!Number.isInteger(target) || target < 1 || target > clips.length) {
      e.target.value = String(fromIndex + 1);
      return;
    }
    const toIndex = target - 1;
    if (toIndex !== fromIndex) onReorder(fromIndex, toIndex);
  };

  const handleReplaceClip = async (clip: Clip) => {
    if (!combinedVideo || replacingClipId) return;
    setReplaceError(null);
    setReplacingClipId(clip.id);
    try {
      const { jobId } = await replaceClip(combinedVideo.file, clips, sources, clip.id);
      setReplaceJobId(jobId);
      setReplaceJob({ id: jobId, stage: "queued", progress: 0, createdAt: Date.now() });
    } catch (err) {
      setReplaceError(err instanceof Error ? err.message : String(err));
      setReplacingClipId(null);
    }
  };

  const handleCancelReplace = async () => {
    if (!replaceJobId) return;
    try {
      await cancelExport(replaceJobId, true);
    } catch (err) {
      setReplaceError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      {combinedVideo && (
        <p className="hint">
          特定のクリップだけ画質・カクつきが気になる場合、行の「🔁 作り直す」から結合済み動画内でその1本だけ
          差し替えられる(他のクリップは再ダウンロードしない)。
        </p>
      )}
      <ol className="clip-list">
        {clips.map((clip, index) => (
          <li key={clip.id} className="clip-row">
            <span className="clip-index">{index + 1}</span>
            <button type="button" className="clip-play" onClick={() => onSeek(clip)} title="この位置を再生">
              ▶
            </button>
            <input
              type="text"
              className="clip-label-input"
              defaultValue={clip.label}
              onBlur={(e) => onRelabel(clip.id, e.target.value.trim() || clip.label)}
              onKeyDown={commitOnEnter}
            />
            <span className="clip-source-title">{titleFor(clip.sourceVideoId)}</span>
            <button
              type="button"
              className="clip-refresh-title"
              onClick={() => onRefreshSourceTitle(clip.sourceVideoId)}
              disabled={refreshingSourceVideoId !== null}
              title="この動画のタイトルを取得し直す(文字化けの修正など)。数秒〜十数秒かかることがある"
            >
              {refreshingSourceVideoId === clip.sourceVideoId ? "取得中..." : "🔄"}
            </button>
            <span className="clip-time-edit">
              <input
                type="text"
                className="clip-time-input"
                defaultValue={formatTime(clip.startSec)}
                onBlur={(e) => handleTimeBlur(e, clip, "start")}
                onKeyDown={commitOnEnter}
                title="開始時間(mm:ss)"
              />
              <span>〜</span>
              <input
                type="text"
                className="clip-time-input"
                defaultValue={formatTime(clip.endSec)}
                onBlur={(e) => handleTimeBlur(e, clip, "end")}
                onKeyDown={commitOnEnter}
                title="終了時間(mm:ss)"
              />
              <span className="clip-duration">({formatTime(clip.endSec - clip.startSec)})</span>
            </span>
            <div className="clip-actions">
              <button type="button" onClick={() => onReorder(index, index - 1)} disabled={index === 0}>
                ↑
              </button>
              <button
                type="button"
                onClick={() => onReorder(index, index + 1)}
                disabled={index === clips.length - 1}
              >
                ↓
              </button>
              <input
                key={index}
                type="number"
                className="clip-move-input"
                min={1}
                max={clips.length}
                defaultValue={index + 1}
                onBlur={(e) => handleMoveBlur(e, index)}
                onKeyDown={commitOnEnter}
                title="移動先の番号を入力してEnter"
              />
              {combinedVideo && (
                <button
                  type="button"
                  onClick={() => void handleReplaceClip(clip)}
                  disabled={replacingClipId !== null}
                  title="この区間だけ動画を取得し直し、結合済み動画内で差し替える"
                >
                  {replacingClipId === clip.id
                    ? `${replaceStageLabel[replaceJob?.stage ?? "queued"]}${replaceJob ? ` ${replaceJob.progress}%` : ""}`
                    : "🔁 作り直す"}
                </button>
              )}
              <button type="button" onClick={() => onRemove(clip.id)}>
                削除
              </button>
            </div>
          </li>
        ))}
      </ol>
      {isReplaceRunning && (
        <div className="job-status">
          <progress value={replaceJob?.progress ?? 0} max={100} />
          <button type="button" onClick={() => void handleCancelReplace()}>
            キャンセル
          </button>
        </div>
      )}
      {replaceError && <p className="error-text">{replaceError}</p>}
    </>
  );
}
