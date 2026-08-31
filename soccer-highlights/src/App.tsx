import { useEffect, useRef, useState } from "react";
import { ApplyAudioPanel } from "./components/ApplyAudioPanel.tsx";
import { ClipList } from "./components/ClipList.tsx";
import { ClipTagger } from "./components/ClipTagger.tsx";
import { ExportPanel } from "./components/ExportPanel.tsx";
import { PlaylistPanel } from "./components/PlaylistPanel.tsx";
import { ProjectPanel, type SaveStatus } from "./components/ProjectPanel.tsx";
import { ReplaceAudioFromPanel } from "./components/ReplaceAudioFromPanel.tsx";
import { SourceUrlInput } from "./components/SourceUrlInput.tsx";
import { YouTubePlayerView, type YouTubePlayerHandle } from "./components/YouTubePlayerView.tsx";
import {
  resolveSource,
  saveProject,
  type CombinedVideoInfo,
  type PlaylistVideo,
  type ProjectData,
  type ProjectPlaylist,
} from "./lib/api.ts";
import { preventFocusSteal } from "./lib/focus.ts";
import { describeYoutubePlayerError } from "./lib/youtubeErrorMessages.ts";
import type { Clip, ClipSource, MusicTrackMeta } from "./types.ts";

const AUTOSAVE_DELAY_MS = 1200;

function buildPlaylistSnapshot(
  url: string,
  title: string | null,
  videos: PlaylistVideo[],
): ProjectPlaylist | null {
  return videos.length > 0 ? { url, title: title ?? "", videos } : null;
}

export default function App() {
  const [sources, setSources] = useState<ClipSource[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [playerErrorCode, setPlayerErrorCode] = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistTitle, setPlaylistTitle] = useState<string | null>(null);
  const [playlistVideos, setPlaylistVideos] = useState<PlaylistVideo[]>([]);
  const [combinedVideo, setCombinedVideo] = useState<CombinedVideoInfo | null>(null);
  const [musicTracks, setMusicTracks] = useState<MusicTrackMeta[]>([]);
  const [projectName, setProjectName] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  const [savedClipCount, setSavedClipCount] = useState<number | null>(null);
  const [refreshingSourceVideoId, setRefreshingSourceVideoId] = useState<string | null>(null);
  const skipNextAutosaveRef = useRef(false);
  const playerRef = useRef<YouTubePlayerHandle>(null);

  useEffect(() => {
    if (!projectName || !autosaveEnabled) return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }

    setHasUnsavedChanges(true);
    const timer = setTimeout(() => {
      setSaveStatus("saving");
      const playlist = buildPlaylistSnapshot(playlistUrl, playlistTitle, playlistVideos);
      saveProject(projectName, sources, clips, playlist, combinedVideo, musicTracks)
        .then((data) => {
          setSaveStatus("saved");
          setLastSavedAt(data.updatedAt);
          setSavedClipCount(data.clips.length);
          setHasUnsavedChanges(false);
        })
        .catch(() => setSaveStatus("error"));
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timer);
    // clips/sources/再生リスト/結合済み動画/音楽トラックの中身が変わるたびに保存タイマーを
    // リセットしたいので依存配列はこれで正しい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    clips,
    sources,
    playlistUrl,
    playlistTitle,
    playlistVideos,
    combinedVideo,
    musicTracks,
    projectName,
    autosaveEnabled,
  ]);

  const handleRenameProject = (name: string) => {
    setProjectName(name);
  };

  const handleSaveNow = () => {
    if (!projectName) return;
    setSaveStatus("saving");
    const playlist = buildPlaylistSnapshot(playlistUrl, playlistTitle, playlistVideos);
    saveProject(projectName, sources, clips, playlist, combinedVideo, musicTracks)
      .then((data) => {
        setSaveStatus("saved");
        setLastSavedAt(data.updatedAt);
        setSavedClipCount(data.clips.length);
        setHasUnsavedChanges(false);
      })
      .catch(() => setSaveStatus("error"));
  };

  const handleLoadProject = (data: ProjectData) => {
    skipNextAutosaveRef.current = true;
    setProjectName(data.name);
    setSources(data.sources);
    setClips(data.clips);
    setPlaylistUrl(data.playlist?.url ?? "");
    setPlaylistTitle(data.playlist?.title ?? null);
    setPlaylistVideos(data.playlist?.videos ?? []);
    setCombinedVideo(data.combinedVideo ?? null);
    setMusicTracks(data.musicTracks ?? []);
    setActiveVideoId(null);
    setPlayerErrorCode(null);
    setLastSavedAt(data.updatedAt);
    setSaveStatus("saved");
    setSavedClipCount(data.clips.length);
    setHasUnsavedChanges(false);
  };

  const handleNewProject = () => {
    skipNextAutosaveRef.current = true;
    setProjectName("");
    setSources([]);
    setClips([]);
    setPlaylistUrl("");
    setPlaylistTitle(null);
    setPlaylistVideos([]);
    setCombinedVideo(null);
    setMusicTracks([]);
    setActiveVideoId(null);
    setPlayerErrorCode(null);
    setLastSavedAt(null);
    setSaveStatus("idle");
    setSavedClipCount(null);
    setHasUnsavedChanges(false);
  };

  const handlePlaylistLoaded = (playlist: { url: string; title: string; videos: PlaylistVideo[] }) => {
    setPlaylistUrl(playlist.url);
    setPlaylistTitle(playlist.title);
    setPlaylistVideos(playlist.videos);
  };

  const handleLoadSource = (meta: { videoId: string; title: string; youtubeUrl: string }) => {
    setSources((prev) => {
      const index = prev.findIndex((s) => s.videoId === meta.videoId);
      if (index === -1) return [...prev, meta];
      if (prev[index].title === meta.title) return prev;
      // 既に登録済みの動画でも、同じURLを読み込み直せばタイトルを最新の内容に更新する
      // (以前の文字化けしたタイトルが残っている場合の修正手段にもなる)。
      const next = [...prev];
      next[index] = { ...next[index], title: meta.title };
      return next;
    });
    setActiveVideoId(meta.videoId);
    setPlayerErrorCode(null);
    playerRef.current?.loadVideo(meta.videoId);
  };

  /** URLを貼り直さなくても、保存済みのURLからタイトルだけ取得し直せるようにする
   * (以前の文字化けしたタイトルが残っている場合の修正手段)。SABR回避のJS challenge解決
   * などでyt-dlp側の応答に数秒〜十数秒かかることがあるため、押した後は無反応に見えないよう
   * ローディング状態を持たせている。 */
  const handleRefreshSourceTitle = async (videoId: string) => {
    const source = sources.find((s) => s.videoId === videoId);
    if (!source || refreshingSourceVideoId) return;
    setRefreshingSourceVideoId(videoId);
    try {
      const meta = await resolveSource(source.youtubeUrl);
      setSources((prev) => prev.map((s) => (s.videoId === videoId ? { ...s, title: meta.title } : s)));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshingSourceVideoId(null);
    }
  };

  const handleAddClip = (startSec: number, endSec: number, label: string): string | null => {
    if (!activeVideoId) return null;
    const id = crypto.randomUUID();
    setClips((prev) => [...prev, { id, sourceVideoId: activeVideoId, label, startSec, endSec }]);
    return id;
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
              clipCount={clips.length}
              saveStatus={saveStatus}
              hasUnsavedChanges={hasUnsavedChanges}
              lastSavedAt={lastSavedAt}
              autosaveEnabled={autosaveEnabled}
              savedClipCount={savedClipCount}
              onRename={handleRenameProject}
              onSaveNow={handleSaveNow}
              onLoadProject={handleLoadProject}
              onNewProject={handleNewProject}
              onToggleAutosave={setAutosaveEnabled}
            />
            <PlaylistPanel
              activeVideoId={activeVideoId}
              playlistUrl={playlistUrl}
              playlistTitle={playlistTitle}
              videos={playlistVideos}
              onSelectVideo={handleLoadSource}
              onPlaylistLoaded={handlePlaylistLoaded}
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
              activeVideoId={activeVideoId}
              getCurrentTime={() => playerRef.current?.getCurrentTime() ?? 0}
              onAddClip={handleAddClip}
              onUpdateTime={handleUpdateTime}
            />
          </section>

          <section className="clips-section">
            <h2>クリップ一覧 ({clips.length})</h2>
            <ClipList
              clips={clips}
              sources={sources}
              combinedVideo={combinedVideo}
              onReorder={handleReorder}
              onRemove={handleRemove}
              onSeek={handleSeek}
              onRelabel={handleRelabel}
              onUpdateTime={handleUpdateTime}
              onRefreshSourceTitle={(videoId) => void handleRefreshSourceTitle(videoId)}
              refreshingSourceVideoId={refreshingSourceVideoId}
            />
          </section>

          <ExportPanel
            clips={clips}
            sources={sources}
            projectName={projectName}
            onCombinedVideoReady={setCombinedVideo}
          />
          <ApplyAudioPanel
            combinedVideo={combinedVideo}
            clips={clips}
            projectName={projectName}
            musicTracks={musicTracks}
            onMusicTracksChange={setMusicTracks}
          />
          <ReplaceAudioFromPanel projectName={projectName} musicTracks={musicTracks} />
        </div>
      </div>
    </div>
  );
}
