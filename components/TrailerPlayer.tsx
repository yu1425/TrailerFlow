"use client";

import { useEffect, useRef } from "react";
import { loadYouTubeApi, type YTPlayer } from "@/lib/youtube";

export interface TrailerPlayerHandle {
  getWatchSeconds: () => number;
  getDuration: () => number;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
}

export interface TrailerPlayerProps {
  videoKey: string;
  autoplay: boolean;
  muted: boolean;
  onReady?: () => void;
  onPlay?: () => void;
  onEnded?: () => void;
  onError?: (error: unknown) => void;
  /** Receives playback stats getters once the player is ready. */
  onStats?: (handle: TrailerPlayerHandle) => void;
}

/**
 * Wraps the YouTube IFrame Player API.
 *
 * - Creates one player instance and reuses it across videoKey changes
 *   (loadVideoById) instead of recreating the iframe each time.
 * - Autoplay only happens once the user has interacted (autoplay prop),
 *   satisfying browser autoplay policies.
 * - Cleans up the player on unmount.
 */
export default function TrailerPlayer({
  videoKey,
  autoplay,
  muted,
  onReady,
  onPlay,
  onEnded,
  onError,
  onStats,
}: TrailerPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const currentKeyRef = useRef<string>(videoKey);

  // Keep latest callbacks in refs so the player effect doesn't re-run on every
  // parent render.
  const cbRef = useRef({ onReady, onPlay, onEnded, onError, onStats });
  cbRef.current = { onReady, onPlay, onEnded, onError, onStats };

  // Create the player once.
  useEffect(() => {
    let cancelled = false;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !containerRef.current) return;

        playerRef.current = new YT.Player(containerRef.current, {
          width: "100%",
          height: "100%",
          videoId: currentKeyRef.current,
          playerVars: {
            autoplay: autoplay ? 1 : 0,
            mute: muted ? 1 : 0,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            fs: 1,
          },
          events: {
            onReady: () => {
              readyRef.current = true;
              if (muted) playerRef.current?.mute();
              else playerRef.current?.unMute();
              if (autoplay) playerRef.current?.playVideo();

              const handle: TrailerPlayerHandle = {
                getWatchSeconds: () =>
                  Math.round(playerRef.current?.getCurrentTime() ?? 0),
                getDuration: () =>
                  Math.round(playerRef.current?.getDuration() ?? 0),
                play: () => playerRef.current?.playVideo(),
                pause: () => playerRef.current?.pauseVideo(),
                togglePlay: () => {
                  const p = playerRef.current;
                  if (!p) return;
                  // 1 === PLAYING
                  if (p.getPlayerState() === YT.PlayerState.PLAYING) {
                    p.pauseVideo();
                  } else {
                    p.playVideo();
                  }
                },
              };
              cbRef.current.onStats?.(handle);
              cbRef.current.onReady?.();
            },
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.ENDED) {
                cbRef.current.onEnded?.();
              } else if (event.data === YT.PlayerState.PLAYING) {
                cbRef.current.onPlay?.();
              }
            },
            onError: (event) => {
              cbRef.current.onError?.(event.data);
            },
          },
        });
      })
      .catch((err) => {
        cbRef.current.onError?.(err);
      });

    return () => {
      cancelled = true;
      readyRef.current = false;
      try {
        playerRef.current?.destroy();
      } catch {
        // ignore teardown errors
      }
      playerRef.current = null;
    };
    // Intentionally run once; videoKey/autoplay/muted handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load a new video when videoKey changes.
  useEffect(() => {
    if (videoKey === currentKeyRef.current && readyRef.current) {
      return;
    }
    currentKeyRef.current = videoKey;
    if (playerRef.current && readyRef.current) {
      if (autoplay) {
        playerRef.current.loadVideoById(videoKey);
      } else {
        playerRef.current.cueVideoById(videoKey);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoKey]);

  // React to mute toggles.
  useEffect(() => {
    if (!playerRef.current || !readyRef.current) return;
    if (muted) playerRef.current.mute();
    else playerRef.current.unMute();
  }, [muted]);

  return (
    <div className="relative h-full w-full bg-black">
      {/* YT.Player replaces this div with an <iframe>. */}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
