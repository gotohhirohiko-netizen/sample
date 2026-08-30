import type { FocusEvent, KeyboardEvent } from "react";
import { formatTime, parseTime } from "../lib/format.ts";
import type { Clip, ClipSource } from "../types.ts";

interface Props {
  clips: Clip[];
  sources: ClipSource[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRemove: (id: string) => void;
  onSeek: (clip: Clip) => void;
  onRelabel: (id: string, label: string) => void;
  onUpdateTime: (id: string, field: "start" | "end", seconds: number) => void;
}

function commitOnEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter") e.currentTarget.blur();
}

export function ClipList({ clips, sources, onReorder, onRemove, onSeek, onRelabel, onUpdateTime }: Props) {
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

  return (
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
            <button type="button" onClick={() => onRemove(clip.id)}>
              削除
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}
