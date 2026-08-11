import { useEffect, useRef, useState } from "react";
import { preventFocusSteal } from "../lib/focus.ts";
import { formatTime } from "../lib/format.ts";

interface Props {
  disabled: boolean;
  getCurrentTime: () => number;
  onAddClip: (startSec: number, endSec: number, label: string) => void;
}

export function ClipTagger({ disabled, getCurrentTime, onAddClip }: Props) {
  const [pendingStart, setPendingStart] = useState<number | null>(null);
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

  const markStart = () => setPendingStart(getCurrentTime());

  const markEnd = () => {
    if (pendingStart === null) return;
    const end = getCurrentTime();
    if (end <= pendingStart) {
      setPendingStart(null);
      return;
    }
    const label = labelInputRef.current?.value.trim() || "クリップ";
    onAddClip(pendingStart, end, label);
    setPendingStart(null);
    if (labelInputRef.current) labelInputRef.current.value = "";
  };

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
          disabled={disabled || pendingStart === null}
        >
          区間終了してクリップ追加
        </button>
      </div>
    </div>
  );
}
