import { formatTime } from "../lib/format.ts";
import type { Clip, ClipSource } from "../types.ts";

interface Props {
  clips: Clip[];
  sources: ClipSource[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRemove: (id: string) => void;
  onSeek: (clip: Clip) => void;
  onRelabel: (id: string, label: string) => void;
}

export function ClipList({ clips, sources, onReorder, onRemove, onSeek, onRelabel }: Props) {
  if (clips.length === 0) {
    return <p className="empty-hint">まだクリップがありません。動画を再生しながら区間を追加してください。</p>;
  }

  const titleFor = (videoId: string) => sources.find((s) => s.videoId === videoId)?.title ?? videoId;

  return (
    <ol className="clip-list">
      {clips.map((clip, index) => (
        <li key={clip.id} className="clip-row">
          <button type="button" className="clip-play" onClick={() => onSeek(clip)} title="この位置を再生">
            ▶
          </button>
          <input
            type="text"
            className="clip-label-input"
            value={clip.label}
            onChange={(e) => onRelabel(clip.id, e.target.value)}
          />
          <span className="clip-source-title">{titleFor(clip.sourceVideoId)}</span>
          <span className="clip-time">
            {formatTime(clip.startSec)} 〜 {formatTime(clip.endSec)} ({formatTime(clip.endSec - clip.startSec)})
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
            <button type="button" onClick={() => onRemove(clip.id)}>
              削除
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}
