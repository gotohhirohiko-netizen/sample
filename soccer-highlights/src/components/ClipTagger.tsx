import { useEffect, useRef, useState } from "react";
import { preventFocusSteal } from "../lib/focus.ts";
import { formatTime } from "../lib/format.ts";

interface LastAddedClip {
  id: string;
  startSec: number;
  endSec: number;
}

interface Props {
  disabled: boolean;
  activeVideoId: string | null;
  getCurrentTime: () => number;
  onAddClip: (startSec: number, endSec: number, label: string) => string | null;
  onUpdateTime: (id: string, field: "start" | "end", seconds: number) => void;
}

export function ClipTagger({ disabled, activeVideoId, getCurrentTime, onAddClip, onUpdateTime }: Props) {
  const [pendingStart, setPendingStart] = useState<number | null>(null);
  const [lastAdded, setLastAdded] = useState<LastAddedClip | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  // ラベル入力はuncontrolledにしている。value+onChangeで毎キー入力ごとに
  // 再描画すると、日本語入力(IME)中に文字化けする不具合が起きるため。
  const labelInputRef = useRef<HTMLInputElement>(null);
  const getCurrentTimeRef = useRef(getCurrentTime);
  getCurrentTimeRef.current = getCurrentTime;

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(getCurrentTimeRef.current()), 400);
    return () => clearInterval(timer);
  }, []);

  // 動画を切り替えたら、別動画のタイムラインで直前のクリップを誤って
  // 修正してしまわないよう、進行中の区間指定をリセットする
  useEffect(() => {
    setPendingStart(null);
    setLastAdded(null);
  }, [activeVideoId]);

  const markStart = () => {
    setPendingStart(getCurrentTime());
    setLastAdded(null);
  };

  // 区間開始が押された直後なら新しいクリップを追加、そうでなければ
  // (区間開始を押し直さずに区間終了を連続で押した場合)直前に追加した
  // クリップの終了時刻を修正する
  const markEnd = () => {
    const end = getCurrentTime();

    if (pendingStart !== null) {
      if (end <= pendingStart) return;
      const label = labelInputRef.current?.value.trim() || "クリップ";
      const id = onAddClip(pendingStart, end, label);
      if (id) setLastAdded({ id, startSec: pendingStart, endSec: end });
      setPendingStart(null);
      if (labelInputRef.current) labelInputRef.current.value = "";
      return;
    }

    if (lastAdded && end > lastAdded.startSec) {
      onUpdateTime(lastAdded.id, "end", end);
      setLastAdded({ ...lastAdded, endSec: end });
    }
  };

  const endButtonLabel =
    pendingStart !== null
      ? "区間終了してクリップ追加"
      : lastAdded
        ? `終了位置を修正(現在 〜${formatTime(lastAdded.endSec)})`
        : "区間終了してクリップ追加";

  return (
    <div className="clip-tagger">
      <p className="current-time-display">現在の再生位置: {formatTime(currentTime)}</p>
      <input
        type="text"
        ref={labelInputRef}
        className="clip-tagger-label-input"
        placeholder="クリップ名(任意、例: 前半ゴール)"
        disabled={disabled}
      />
      <div className="clip-tagger-actions">
        <button type="button" onMouseDown={preventFocusSteal} onClick={markStart} disabled={disabled}>
          区間開始{pendingStart !== null ? ` (${formatTime(pendingStart)}〜)` : ""}
        </button>
        <button
          type="button"
          onMouseDown={preventFocusSteal}
          onClick={markEnd}
          disabled={disabled || (pendingStart === null && !lastAdded)}
        >
          {endButtonLabel}
        </button>
      </div>
    </div>
  );
}
