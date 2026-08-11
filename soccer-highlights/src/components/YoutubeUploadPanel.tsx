import { useEffect, useState } from "react";
import { getYoutubeAuthStatus, getYoutubeAuthUrl, uploadToYoutube } from "../lib/api.ts";

interface Props {
  outputFile: string;
  defaultTitle: string;
}

type PrivacyStatus = "private" | "unlisted" | "public";

export function YoutubeUploadPanel({ outputFile, defaultTitle }: Props) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState("");
  const [privacyStatus, setPrivacyStatus] = useState<PrivacyStatus>("private");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = () => {
    getYoutubeAuthStatus()
      .then((s) => setAuthenticated(s.authenticated))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const handleLogin = async () => {
    setError(null);
    try {
      const { url } = await getYoutubeAuthUrl();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUpload = async () => {
    setUploading(true);
    setError(null);
    try {
      const res = await uploadToYoutube({ outputFile, title, description, privacyStatus });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="youtube-upload-panel">
      <h3>YouTubeにアップロード</h3>

      {authenticated === null && <p>認証状態を確認中...</p>}

      {authenticated === false && (
        <div className="youtube-login">
          <p>YouTubeにログインしていません。</p>
          <button type="button" onClick={handleLogin}>
            YouTubeにログイン
          </button>
          <button type="button" onClick={checkStatus}>
            ログイン後、再確認
          </button>
        </div>
      )}

      {authenticated && !result && (
        <div className="youtube-upload-form">
          <label>
            タイトル
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            説明
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </label>
          <label>
            公開設定
            <select
              value={privacyStatus}
              onChange={(e) => setPrivacyStatus(e.target.value as PrivacyStatus)}
            >
              <option value="private">非公開</option>
              <option value="unlisted">限定公開</option>
              <option value="public">公開</option>
            </select>
          </label>
          <button type="button" onClick={handleUpload} disabled={uploading || !title.trim()}>
            {uploading ? "アップロード中..." : "アップロード"}
          </button>
        </div>
      )}

      {result && (
        <p>
          アップロード完了:{" "}
          <a href={result.url} target="_blank" rel="noreferrer">
            {result.url}
          </a>
        </p>
      )}

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
