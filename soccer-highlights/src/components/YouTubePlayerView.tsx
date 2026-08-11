import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { loadYouTubeIframeApi, type YouTubePlayer } from "../lib/youtubePlayerApi.ts";

export interface YouTubePlayerHandle {
  getCurrentTime(): number;
  seekTo(seconds: number): void;
  loadVideo(videoId: string): void;
}

interface Props {
  onError?: (code: number) => void;
}

export const YouTubePlayerView = forwardRef<YouTubePlayerHandle, Props>(function YouTubePlayerView(
  { onError },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let destroyed = false;
    loadYouTubeIframeApi().then((YT) => {
      if (destroyed || !containerRef.current) return;
      playerRef.current = new YT.Player(containerRef.current, {
        width: "100%",
        height: "100%",
        playerVars: { playsinline: 1, origin: window.location.origin },
        events: {
          onError: (event) => onErrorRef.current?.(event.data),
        },
      });
    });
    return () => {
      destroyed = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
    seekTo: (seconds: number) => playerRef.current?.seekTo(seconds, true),
    loadVideo: (videoId: string) => playerRef.current?.loadVideoById(videoId),
  }));

  return <div className="youtube-player" ref={containerRef} />;
});
