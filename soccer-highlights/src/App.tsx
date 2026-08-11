import { useEffect, useRef, useState } from "react";
import { ClipList } from "./components/ClipList.tsx";
import { ClipTagger } from "./components/ClipTagger.tsx";
import { ExportPanel } from "./components/ExportPanel.tsx";
import { PlaylistPanel } from "./components/PlaylistPanel.tsx";
import { ProjectPanel, type SaveStatus } from "./components/ProjectPanel.tsx";
import { SourceUrlInput } from "./components/SourceUrlInput.tsx";
import { YouTubePlayerView, type YouTubePlayerHandle } from "./components/YouTubePlayerView.tsx";
import { saveProject, type PlaylistVideo, type ProjectData } from "./lib/api.ts";
import { preventFocusSteal } from "./lib/focus.ts";
import { describeYoutubePlayerError } from "./lib/youtubeErrorMessages.ts";
import type { Clip, ClipSource } from "./types.ts";

const AUTOSAVE_DELAY_MS = 1200;

export default function App() {
  const [sources, setSources] = useState<ClipSource[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [playerErrorCode, setPlayerErrorCode] = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [playlistVideos, setPlaylistVideos] = useState<PlaylistVideo[]>([]);
  const [projectName, setProjectName] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const skipNextAutosaveRef = useRef(false);
  const playerRef = useRef<YouTubePlayerHandle>(null);

  useEffect(() => {
    if (!projectName) return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }

    setHasUnsavedChanges(true);
    const timer = setTimeout(() => {
      setSaveStatus("saving");
      saveProject(projectName, sources, clips)
        .then((data) => {
          setSaveStatus("saved");
          setLastSavedAt(data.updatedAt);
          setHasUnsavedChanges(false);
        })
        .catch(() => setSaveStatus("error"));
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timer);
    // clips/sourcesの中身が変わるたびに保存タイマーをリセットしたいので依存配列はこれで正しい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips, sources, projectName]);

  const handleRenameProject = (name: string) => {
    setProjectName(name);
  };

  const handleSaveNow = () => {
    if (!projectName) return;
    setSaveStatus("saving");
    saveProject(projectName, sources, clips)
      .then((data) => {
        setSaveStatus("saved");
        setLastSavedAt(data.updatedAt);
        setHasUnsavedChanges(false);
      })
      .catch(() => setSaveStatus("error"));
  };

  const handleLoadProject = (data: ProjectData) => {
    skipNextAutosaveRef.current = true;
    setProjectName(data.name);
    setSources(data.sources);
    setClips(data.clips);
    setActiveVideoId(null);
    setPlayerErrorCode(null);
    setLastSavedAt(data.updatedAt);
    setSaveStatus("saved");
    setHasUnsavedChanges(false);
  };

  const handleNewProject = () => {
    skipNextAutosaveRef.current = true;
    setProjectName("");
    setSources([]);
    setClips([]);
    setActiveVideoId(null);
    setPlayerErrorCode(null);
    setLastSavedAt(null);
    setSaveStatus("idle");
    setHasUnsavedChanges(false);
  };

  const handleLoadSource = (meta: { videoId: string; title: string; youtubeUrl: string }) => {
    setSources((prev) => (prev.some((s) => s.videoId === meta.videoId) ? prev : [...prev, meta]));
    setActiveVideoId(meta.videoId);
    setPlayerErrorCode(null);
    playerRef.current?.loadVideo(meta.videoId);
  };

  const handleAddClip = (startSec: number, endSec: number, label: string) => {
    if (!activeVideoId) return;
    setClips((prev) => [
      ...prev,
      { id: crypto.randomUUID(), sourceVideoId: activeVideoId, label, startSec, endSec },
    ]);
  };

  const handleReorder = (fromIndex: number, toIndex: number) => {
    setClips((prev) => {
      if (toIndex < 0 || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const handleRemove = (id: string) => setClips((prev) => prev.filter((c) => c.id !== id));

  const handleRelabel = (id: string, label: string) =>
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, label } : c)));

  const handleUpdateTime = (id: string, field: "start" | "end", seconds: number) =>
    setClips((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        return field === "start" ? { ...c, startSec: seconds } : { ...c, endSec: seconds };
      }),
    );

  const playlistIndex = playlistVideos.findIndex((v) => v.videoId === activeVideoId);
  const hasPrevInPlaylist = playlistIndex > 0;
  const hasNextInPlaylist = playlistIndex !== -1 && playlistIndex < playlistVideos.length - 1;

  const handlePlaylistStep = (offset: 1 | -1) => {
    const targetIndex = playlistIndex + offset;
    const target = playlistVideos[targetIndex];
    if (!target) return;
    handleLoadSource({
      videoId: target.videoId,
      title: target.title,
      youtubeUrl: `https://www.youtube.com/watch?v=${target.videoId}`,
    });
  };

  const handleSeek = (clip: Clip) => {
    if (clip.sourceVideoId !== activeVideoId) {
      const source = sources.find((s) => s.videoId === clip.sourceVideoId);
      if (!source) return;
      setActiveVideoId(source.videoId);
      playerRef.current?.loadVideo(source.videoId);
    }
    playerRef.current?.seekTo(clip.startSec);
  };

  return (
    <div className="app">
      <header>
        <h1>サッカーハイライト作成ツール</h1>
      </header>

      <div className="app-layout">
        <div className={sidebarCollapsed ? "sidebar-column collapsed" : "sidebar-column"}>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((c) => !c)}
            title={sidebarCollapsed ? "メニューを開く" : "メニューをたたんで動画を広げる"}
          >
            {sidebarCollapsed ? "▶" : "◀ たたむ"}
          </button>

          {/* たたんでいる間も再生リストの読み込み内容などが消えないよう、
              アンマウントせずCSSで非表示にするだけにしている */}
          <div className="sidebar-content">
            <ProjectPanel
              projectName={projectName}
              saveStatus={saveStatus}
              hasUnsavedChanges={hasUnsavedChanges}
              lastSavedAt={lastSavedAt}
              onRename={handleRenameProject}
              onSaveNow={handleSaveNow}
              onLoadProject={handleLoadProject}
              onNewProject={handleNewProject}
            />
            <PlaylistPanel
              activeVideoId={activeVideoId}
              onSelectVideo={handleLoadSource}
              onVideosLoaded={setPlaylistVideos}
            />
          </div>
        </div>

        <div className="main-content">
          <section className="player-section">
            <div className="player-top-row">
              <SourceUrlInput onLoad={handleLoadSource} />
              {playlistVideos.length > 0 && (
                <div className="playlist-nav-buttons">
                  <button
                    type="button"
                    onMouseDown={preventFocusSteal}
                    onClick={() => handlePlaylistStep(-1)}
                    disabled={!hasPrevInPlaylist}
                    title="再生リストの前の動画へ"
                  >
                    ◀ 前へ
                  </button>
                  <button
                    type="button"
                    onMouseDown={preventFocusSteal}
                    onClick={() => handlePlaylistStep(1)}
                    disabled={!hasNextInPlaylist}
                    title="再生リストの次の動画へ"
                  >
                    次へ ▶
                  </button>
                </div>
              )}
            </div>
            <div className="player-wrapper">
              <YouTubePlayerView ref={playerRef} onError={setPlayerErrorCode} />
            </div>
            {playerErrorCode !== null && (
              <p className="error-text">
                {describeYoutubePlayerError(playerErrorCode)}(エラーコード: {playerErrorCode})
              </p>
            )}
            <ClipTagger
              disabled={!activeVideoId}
              getCurrentTime={() => playerRef.current?.getCurrentTime() ?? 0}
              onAddClip={handleAddClip}
            />
          </section>

          <section className="clips-section">
            <h2>クリップ一覧 ({clips.length})</h2>
            <ClipList
              clips={clips}
              sources={sources}
              onReorder={handleReorder}
              onRemove={handleRemove}
              onSeek={handleSeek}
              onRelabel={handleRelabel}
              onUpdateTime={handleUpdateTime}
            />
          </section>

          <ExportPanel clips={clips} sources={sources} />
        </div>
      </div>
    </div>
  );
}
