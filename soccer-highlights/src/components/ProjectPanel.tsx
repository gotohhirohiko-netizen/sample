import { useEffect, useRef, useState } from "react";
import { listProjects, loadProject, type ProjectData, type ProjectSummary } from "../lib/api.ts";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface Props {
  projectName: string;
  clipCount: number;
  saveStatus: SaveStatus;
  hasUnsavedChanges: boolean;
  lastSavedAt: number | null;
  autosaveEnabled: boolean;
  savedClipCount: number | null;
  onRename: (name: string) => void;
  onSaveNow: () => void;
  onLoadProject: (data: ProjectData) => void;
  onNewProject: () => void;
  onToggleAutosave: (enabled: boolean) => void;
}

export function ProjectPanel({
  projectName,
  clipCount,
  saveStatus,
  hasUnsavedChanges,
  lastSavedAt,
  autosaveEnabled,
  savedClipCount,
  onRename,
  onSaveNow,
  onLoadProject,
  onNewProject,
  onToggleAutosave,
}: Props) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    // 保存が完了するたびに一覧(更新日時・件数)を最新化する
  }, [lastSavedAt]);

  const nameInputRef = useRef<HTMLInputElement>(null);

  const commitName = () => {
    const value = nameInputRef.current?.value.trim() ?? "";
    if (value !== projectName) onRename(value);
  };

  const handleOpen = async (name: string) => {
    if (!name) return;
    setError(null);
    try {
      const data = await loadProject(name);
      onLoadProject(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const statusText = (): string => {
    if (!projectName) return "プロジェクト名を入力すると保存できるようになります";
    if (saveStatus === "saving") return "保存中...";
    if (saveStatus === "error") return "保存に失敗しました(サーバーが起動しているか確認してください)";

    if (autosaveEnabled) {
      if (hasUnsavedChanges) return "未保存の変更があります";
      if (lastSavedAt) return `自動保存済み: ${new Date(lastSavedAt).toLocaleTimeString()}`;
      return "";
    }

    // 自動保存オフ: 保存済みのクリップ数と現在のクリップ数を比較して表示する
    if (savedClipCount === null) {
      return clipCount > 0
        ? `未保存です(現在${clipCount}件)。「今すぐ保存」を押してください`
        : "自動保存はオフです";
    }
    if (savedClipCount !== clipCount) {
      return `保存が必要です(保存済み${savedClipCount}件 → 現在${clipCount}件)`;
    }
    return `保存済み: ${savedClipCount}件で最新です${lastSavedAt ? `(${new Date(lastSavedAt).toLocaleTimeString()})` : ""}`;
  };

  return (
    <section className="project-panel">
      <h2>プロジェクト(クリップ {clipCount}件)</h2>

      <p className="hint">{statusText()}</p>

      <label className="autosave-toggle">
        <input
          type="checkbox"
          checked={autosaveEnabled}
          onChange={(e) => onToggleAutosave(e.target.checked)}
        />
        自動保存を有効にする
      </label>

      <div className="project-name-row">
        <input
          type="text"
          key={projectName}
          ref={nameInputRef}
          defaultValue={projectName}
          placeholder="プロジェクト名(例: 8/10 練習試合)"
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <button type="button" onClick={onSaveNow} disabled={!projectName}>
          今すぐ保存
        </button>
        <button type="button" onClick={onNewProject}>
          新規プロジェクト
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {projects.length > 0 && (
        <label className="project-open-row">
          保存済みプロジェクトを開く
          <select
            value=""
            onChange={(e) => {
              const value = e.target.value;
              e.target.value = "";
              void handleOpen(value);
            }}
          >
            <option value="" disabled>
              選択してください
            </option>
            {projects.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}({p.clipCount}クリップ)
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}
