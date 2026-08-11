import { useRef, useState } from "react";
import { ClipList } from "./components/ClipList.tsx";
import { ClipTagger } from "./components/ClipTagger.tsx";
import { ExportPanel } from "./components/ExportPanel.tsx";
import { SourceUrlInput } from "./components/SourceUrlInput.tsx";
import { YouTubePlayerView, type YouTubePlayerHandle } from "./components/YouTubePlayerView.tsx";
import type { Clip, ClipSource } from "./types.ts";

export default function App() {
  const [sources, setSources] = useState<ClipSource[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const playerRef = useRef<YouTubePlayerHandle>(null);

  const handleLoadSource = (meta: { videoId: string; title: string; youtubeUrl: string }) => {
    setSources((prev) => (prev.some((s) => s.videoId === meta.videoId) ? prev : [...prev, meta]));
    setActiveVideoId(meta.videoId);
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

      <section className="player-section">
        <SourceUrlInput onLoad={handleLoadSource} />
        <div className="player-wrapper">
          <YouTubePlayerView ref={playerRef} />
        </div>
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
        />
      </section>

      <ExportPanel clips={clips} sources={sources} />
    </div>
  );
}
