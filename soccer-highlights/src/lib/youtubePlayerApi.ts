export interface YouTubePlayer {
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  loadVideoById(videoId: string): void;
  cueVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
}

export interface YouTubePlayerOptions {
  videoId?: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, unknown>;
  events?: {
    onReady?: (event: { target: YouTubePlayer }) => void;
    onStateChange?: (event: { target: YouTubePlayer; data: number }) => void;
  };
}

interface YouTubeIframeApi {
  Player: new (elementOrId: string | HTMLElement, options: YouTubePlayerOptions) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeIframeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeIframeApi> | null = null;

/** YouTube IFrame Player APIのscriptタグを一度だけ読み込み、準備完了を待つ。 */
export function loadYouTubeIframeApi(): Promise<YouTubeIframeApi> {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve(window.YT as YouTubeIframeApi);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });

  return apiPromise;
}
