import { useState, type FormEvent } from "react";
import { resolveSource } from "../lib/api.ts";

interface Props {
  onLoad: (meta: { videoId: string; title: string; youtubeUrl: string }) => void;
}

export function SourceUrlInput({ onLoad }: Props) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    try {
      const meta = await resolveSource(trimmed);
      onLoad({ videoId: meta.videoId, title: meta.title, youtubeUrl: trimmed });
      setUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="source-url-input" onSubmit={handleSubmit}>
      <input
        type="url"
        placeholder="YouTubeの試合動画URLを貼り付け"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={loading}
        required
      />
      <button type="submit" disabled={loading}>
        {loading ? "読み込み中..." : "読み込む"}
      </button>
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}
