"use client";

import { useEffect, useRef } from "react";
import { loadYouTubeApi, type YTNamespace, type YTPlayer } from "@/lib/youtube";

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
  onDuration?: (seconds: number) => void;
  onEnded?: () => void;
  onError?: (error: unknown) => void;
  /** Receives playback stats getters once the player is ready. */
  onStats?: (handle: TrailerPlayerHandle) => void;
  /**
   * Called when an unmuted autoplay attempt was silently blocked by the
   * browser and the player fell back to muted playback so it could start at
   * all. Parent should reflect `muted: true` in its own state.
   */
  onAutoplayMuted?: () => void;
}

// How long to wait after requesting unmuted autoplay before checking whether
// the browser actually honoured it. Long enough for slow players to reach
// PLAYING, short enough that a blocked attempt doesn't sit silent for long.
const AUTOPLAY_UNMUTE_CHECK_MS = 1200;

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
  onDuration,
  onEnded,
  onError,
  onStats,
  onAutoplayMuted,
}: TrailerPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const ytRef = useRef<YTNamespace | null>(null);
  const readyRef = useRef(false);
  const currentKeyRef = useRef<string>(videoKey);
  const durationSentRef = useRef(false);
  const durationPollRef = useRef<number | null>(null);

  // Keep latest callbacks in refs so the player effect doesn't re-run on every
  // parent render.
  const cbRef = useRef({
    onReady,
    onPlay,
    onDuration,
    onEnded,
    onError,
    onStats,
    onAutoplayMuted,
  });
  cbRef.current = {
    onReady,
    onPlay,
    onDuration,
    onEnded,
    onError,
    onStats,
    onAutoplayMuted,
  };

  // Some browsers silently block unmuted autoplay (or force-mute it) rather
  // than raising an error. If we asked for unmuted playback, check shortly
  // after whether it actually took — if not, fall back to muted playback so
  // the trailer still starts, and let the parent know so its UI/state stays
  // in sync.
  const scheduleAutoplayFallbackCheck = () => {
    window.setTimeout(() => {
      const p = playerRef.current;
      const YT = ytRef.current;
      if (!p || !YT) return;
      let stillMuted = false;
      try {
        stillMuted = p.isMuted();
      } catch {
        stillMuted = false;
      }
      const state = p.getPlayerState();
      const notPlaying =
        state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.BUFFERING;
      if (stillMuted || notPlaying) {
        try {
          p.mute();
          p.playVideo();
        } catch {
          // ignore
        }
        cbRef.current.onAutoplayMuted?.();
      }
    }, AUTOPLAY_UNMUTE_CHECK_MS);
  };

  const clearDurationPoll = () => {
    if (durationPollRef.current) {
      window.clearTimeout(durationPollRef.current);
      durationPollRef.current = null;
    }
  };

  const reportDurationWhenAvailable = (attempt = 0) => {
    if (durationSentRef.current) return;
    const duration = Math.round(playerRef.current?.getDuration() ?? 0);
    if (duration > 0) {
      durationSentRef.current = true;
      cbRef.current.onDuration?.(duration);
      return;
    }
    if (attempt >= 12) return;
    clearDurationPoll();
    durationPollRef.current = window.setTimeout(
      () => reportDurationWhenAvailable(attempt + 1),
      250,
    );
  };

  // Create the player once.
  useEffect(() => {
    let cancelled = false;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !containerRef.current) return;
        ytRef.current = YT;

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
              if (autoplay && !muted) scheduleAutoplayFallbackCheck();

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
              reportDurationWhenAvailable();
            },
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.ENDED) {
                cbRef.current.onEnded?.();
              } else if (event.data === YT.PlayerState.PLAYING) {
                cbRef.current.onPlay?.();
                reportDurationWhenAvailable();
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
      clearDurationPoll();
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
    durationSentRef.current = false;
    clearDurationPoll();
    if (playerRef.current && readyRef.current) {
      if (autoplay) {
        playerRef.current.loadVideoById(videoKey);
        if (!muted) scheduleAutoplayFallbackCheck();
      } else {
        playerRef.current.cueVideoById(videoKey);
      }
      reportDurationWhenAvailable();
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
