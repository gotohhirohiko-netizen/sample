import { useRef, useState } from "react";
import { formatTime } from "../lib/format.ts";

interface Props {
  disabled: boolean;
  getCurrentTime: () => number;
  onAddClip: (startSec: number, endSec: number, label: string) => void;
}

export function ClipTagger({ disabled, getCurrentTime, onAddClip }: Props) {
  const [pendingStart, setPendingStart] = useState<number | null>(null);
  // ラベル入力はuncontrolledにしている。value+onChangeで毎キー入力ごとに
  // 再描画すると、日本語入力(IME)中に文字化けする不具合が起きるため。
  const labelInputRef = useRef<HTMLInputElement>(null);

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
      <input
        type="text"
        ref={labelInputRef}
        placeholder="クリップ名(任意、例: 前半ゴール)"
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
