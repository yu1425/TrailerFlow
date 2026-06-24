/**
 * Minimal typings + loader for the YouTube IFrame Player API.
 *
 * We avoid pulling in @types/youtube to keep deps small; only the surface we
 * use is declared here.
 */

export interface YTPlayerVars {
  autoplay?: 0 | 1;
  mute?: 0 | 1;
  controls?: 0 | 1;
  modestbranding?: 0 | 1;
  rel?: 0 | 1;
  playsinline?: 0 | 1;
  fs?: 0 | 1;
}

export interface YTOnStateChangeEvent {
  data: number;
  target: YTPlayer;
}

export interface YTOnErrorEvent {
  data: number;
  target: YTPlayer;
}

export interface YTPlayer {
  loadVideoById(videoId: string): void;
  cueVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  unMute(): void;
  getDuration(): number;
  getCurrentTime(): number;
  getPlayerState(): number;
  destroy(): void;
}

export interface YTPlayerOptions {
  videoId?: string;
  width?: string | number;
  height?: string | number;
  playerVars?: YTPlayerVars;
  events?: {
    onReady?: (event: { target: YTPlayer }) => void;
    onStateChange?: (event: YTOnStateChangeEvent) => void;
    onError?: (event: YTOnErrorEvent) => void;
  };
}

export interface YTNamespace {
  Player: new (el: HTMLElement | string, opts: YTPlayerOptions) => YTPlayer;
  PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const SCRIPT_SRC = "https://www.youtube.com/iframe_api";

let apiReadyPromise: Promise<YTNamespace> | null = null;

/**
 * Loads the IFrame API script once and resolves when window.YT is ready.
 * Repeated calls share the same promise.
 */
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube API can only load in the browser"));
  }
  if (window.YT && window.YT.Player) {
    return Promise.resolve(window.YT);
  }
  if (apiReadyPromise) return apiReadyPromise;

  apiReadyPromise = new Promise<YTNamespace>((resolve) => {
    // The API calls this global when ready.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };

    if (!document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
      const tag = document.createElement("script");
      tag.src = SCRIPT_SRC;
      document.head.appendChild(tag);
    }
  });

  return apiReadyPromise;
}
