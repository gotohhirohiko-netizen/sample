import { useState } from "react";
import { formatTime } from "../lib/format.ts";

interface Props {
  disabled: boolean;
  getCurrentTime: () => number;
  onAddClip: (startSec: number, endSec: number, label: string) => void;
}

export function ClipTagger({ disabled, getCurrentTime, onAddClip }: Props) {
  const [pendingStart, setPendingStart] = useState<number | null>(null);
  const [label, setLabel] = useState("");

  const markStart = () => setPendingStart(getCurrentTime());

  const markEnd = () => {
    if (pendingStart === null) return;
    const end = getCurrentTime();
    if (end <= pendingStart) {
      setPendingStart(null);
      return;
    }
    onAddClip(pendingStart, end, label.trim() || "クリップ");
    setPendingStart(null);
    setLabel("");
  };

  return (
    <div className="clip-tagger">
      <input
        type="text"
        placeholder="クリップ名(任意、例: 前半ゴール)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        disabled={disabled}
      />
      <button type="button" onClick={markStart} disabled={disabled}>
        区間開始{pendingStart !== null ? ` (${formatTime(pendingStart)}〜)` : ""}
      </button>
      <button type="button" onClick={markEnd} disabled={disabled || pendingStart === null}>
        区間終了してクリップ追加
      </button>
    </div>
  );
}
