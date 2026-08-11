import { useRef, useState, type FormEvent } from "react";
import { resolvePlaylist, type PlaylistVideo } from "../lib/api.ts";

interface Props {
  activeVideoId: string | null;
  onSelectVideo: (meta: { videoId: string; title: string; youtubeUrl: string }) => void;
  onVideosLoaded: (videos: PlaylistVideo[]) => void;
}

export function PlaylistPanel({ activeVideoId, onSelectVideo, onVideosLoaded }: Props) {
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playlistTitle, setPlaylistTitle] = useState<string | null>(null);
  const [videos, setVideos] = useState<PlaylistVideo[]>([]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const url = urlInputRef.current?.value.trim();
    if (!url) return;

    setLoading(true);
    setError(null);
    try {
      const result = await resolvePlaylist(url);
      setPlaylistTitle(result.title);
      setVideos(result.videos);
      onVideosLoaded(result.videos);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside className="playlist-panel">
      <div className="panel-header">
        <h2>再生リスト</h2>
      </div>

      <form onSubmit={handleSubmit} className="playlist-url-form">
        <input type="url" ref={urlInputRef} placeholder="再生リストのURL" disabled={loading} />
        <button type="submit" disabled={loading}>
          {loading ? "読み込み中..." : "読み込む"}
        </button>
      </form>

      {error && <p className="error-text">{error}</p>}
      {playlistTitle && <p className="playlist-title">{playlistTitle}</p>}

      {videos.length > 0 && (
        <ul className="playlist-video-list">
          {videos.map((video) => (
            <li key={video.videoId}>
              <button
                type="button"
                className={video.videoId === activeVideoId ? "playlist-video active" : "playlist-video"}
                onClick={() =>
                  onSelectVideo({
                    videoId: video.videoId,
                    title: video.title,
                    youtubeUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
                  })
                }
              >
                {video.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
