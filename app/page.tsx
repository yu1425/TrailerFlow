"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import TrailerPlayer, {
  type TrailerPlayerHandle,
} from "@/components/TrailerPlayer";
import StartOverlay from "@/components/StartOverlay";
import ActionBar from "@/components/ActionBar";
import MovieInfoPanel from "@/components/MovieInfoPanel";
import ChannelSelector from "@/components/ChannelSelector";
import Wordmark from "@/components/Wordmark";
import LobbyLoading from "@/components/LobbyLoading";
import NextUpOverlay from "@/components/NextUpOverlay";
import DebugPanel, { type DebugStats } from "@/components/DebugPanel";
import ShortcutsHelp, { useShortcutsHelp } from "@/components/ShortcutsHelp";
import { getOrCreateAnonymousUserId } from "@/lib/anonymousUser";
import { loadYouTubeApi } from "@/lib/youtube";
import { trackEvent } from "@/lib/events";
import { addToWatchlist, removeFromWatchlist } from "@/lib/watchlist";
import {
  getRecentlyWatched,
  pushRecentlyWatched,
} from "@/lib/recentlyWatched";
import { getChannelsForMode } from "@/lib/feed";
import type { FeedItem, FeedResponse } from "@/types/trailer";

const DATA_MODE =
  process.env.NEXT_PUBLIC_DATA_MODE ??
  process.env.DATA_MODE ??
  "manual";

const REFILL_THRESHOLD = 3;
const DEFAULT_CHANNEL = "lobby";
const CHANNEL_STORAGE_KEY = "trailerflow.channel";
const MUTED_STORAGE_KEY = "trailerflow.muted";
const AUTOPLAY_MUTED_NOTICE_MS = 4000;
const LONG_TRAILER_KEYS_STORAGE_KEY = "trailerflow.tmdb.longTrailerKeys";
const LONG_TRAILER_SECONDS = 4 * 60 + 30;
const MAX_LONG_TRAILER_KEYS = 200;
const TRANSITION_SAFETY_MS = 2500;
// If the initial feed fetch hasn't resolved by this point we surface the retry
// CTA instead of leaving the visitor on the lobby spinner forever. Real fetches
// return in <1s; 15s is generous for cold-start cases.
const FEED_FETCH_TIMEOUT_MS = 15000;

const DEBUG_ENABLED = process.env.NEXT_PUBLIC_DEBUG_PANEL === "true";

function readStored(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function persist(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function readStoredJsonArray(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export default function HomePage() {
  const [anonymousUserId, setAnonymousUserId] = useState<string | null>(null);
  const [queue, setQueue] = useState<FeedItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedChannel, setSelectedChannel] = useState(DEFAULT_CHANNEL);
  const [hasStarted, setHasStarted] = useState(false);
  // Start muted so the YouTube IFrame autoplay policy lets the first trailer
  // roll immediately after the StartOverlay click, and so server/client
  // render match (no localStorage on the server). Once mounted, the first-
  // mount effect below restores the visitor's saved preference — if they
  // previously turned sound on, we try unmuted from then on.
  const [muted, setMuted] = useState(true);
  const [autoplayMutedNotice, setAutoplayMutedNotice] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [watchlistedIds, setWatchlistedIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [currentDurationSeconds, setCurrentDurationSeconds] =
    useState<number | null>(null);
  const [longTrailerKeys, setLongTrailerKeys] = useState<Set<string>>(
    () => new Set(),
  );

  const shortcuts = useShortcutsHelp();

  // Session KPIs for the debug panel.
  const sessionStartedAtRef = useRef<number>(Date.now());
  const [stats, setStats] = useState({
    trailersWatched: 0,
    trailersSkipped: 0,
    watchlistAdds: 0,
    watchSecondsTotal: 0,
    watchSamples: 0,
  });

  // Player handle + session-level dedup set (movie ids already queued).
  const statsRef = useRef<TrailerPlayerHandle | null>(null);
  const sessionSeenRef = useRef<Set<number>>(new Set());

  const currentItem: FeedItem | null = queue[currentIndex] ?? null;

  // --- Feed fetching -------------------------------------------------------

  const rememberQueued = useCallback((items: FeedItem[]) => {
    for (const it of items) sessionSeenRef.current.add(it.movie.id);
  }, []);

  const fetchFeed = useCallback(
    async (
      userId: string,
      channel: string,
    ): Promise<FeedItem[]> => {
      const exclude = Array.from(
        new Set([...getRecentlyWatched(), ...sessionSeenRef.current]),
      );
      const params = new URLSearchParams({
        anonymousUserId: userId,
        channel,
        limit: "10",
        preferredLanguage: "ja",
      });
      if (exclude.length > 0) {
        params.set("recentlyWatchedMovieIds", exclude.join(","));
      }
      if (DATA_MODE === "tmdb" && longTrailerKeys.size > 0) {
        params.set(
          "deprioritizedVideoKeys",
          Array.from(longTrailerKeys).slice(0, MAX_LONG_TRAILER_KEYS).join(","),
        );
      }
      // Abort if the network hangs so the LobbyLoading screen never gets
      // stuck on the rotating "予告編を準備しています…" message.
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        FEED_FETCH_TIMEOUT_MS,
      );
      try {
        const res = await fetch(`/api/feed?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Feed request failed: ${res.status}`);
        const data = (await res.json()) as FeedResponse;
        return data.items;
      } finally {
        clearTimeout(timeout);
      }
    },
    [longTrailerKeys],
  );

  // Initial / retryable load.
  const runInitialLoad = useCallback(
    async (userId: string, channel: string) => {
      setIsLoading(true);
      setLoadError(false);
      try {
        const items = await fetchFeed(userId, channel);
        rememberQueued(items);
        setQueue(items);
        setCurrentIndex(0);
      } catch (err) {
        console.error("Feed load failed", err);
        setLoadError(true);
      } finally {
        setIsLoading(false);
      }
    },
    [fetchFeed, rememberQueued],
  );

  // First mount: identity, stored prefs, initial queue + existing watchlist.
  useEffect(() => {
    const userId = getOrCreateAnonymousUserId();
    setAnonymousUserId(userId);

    const initialChannel = readStored(CHANNEL_STORAGE_KEY, DEFAULT_CHANNEL);
    setSelectedChannel(initialChannel);
    setLongTrailerKeys(
      new Set(readStoredJsonArray(LONG_TRAILER_KEYS_STORAGE_KEY)),
    );
    // Only an explicit "false" opts back into unmuted playback; any other
    // value (missing, "true", corrupted) keeps the muted-by-default start.
    setMuted(readStored(MUTED_STORAGE_KEY, "true") !== "false");

    // Watchlist state (best-effort, non-blocking).
    fetch(`/api/watchlist?anonymousUserId=${encodeURIComponent(userId)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items: FeedItem[] }) =>
        setWatchlistedIds(new Set(d.items.map((it) => it.movie.id))),
      )
      .catch(() => undefined);

    // Warm the YouTube IFrame API in the background so the player mounts
    // faster the moment the visitor dismisses the StartOverlay.
    loadYouTubeApi().catch(() => undefined);

    void runInitialLoad(userId, initialChannel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Top up the queue when it's running low.
  const maybeRefill = useCallback(async () => {
    if (!anonymousUserId || isFetchingMore) return;
    const remaining = queue.length - currentIndex - 1;
    if (remaining > REFILL_THRESHOLD) return;

    setIsFetchingMore(true);
    try {
      const more = await fetchFeed(
        anonymousUserId,
        selectedChannel,
      );
      setQueue((prev) => {
        const seen = new Set(prev.map((i) => i.movie.id));
        const fresh = more.filter((i) => !seen.has(i.movie.id));
        rememberQueued(fresh);
        return [...prev, ...fresh];
      });
    } catch (err) {
      console.error("Refill failed", err);
    } finally {
      setIsFetchingMore(false);
    }
  }, [
    anonymousUserId,
    currentIndex,
    queue.length,
    selectedChannel,
    isFetchingMore,
    fetchFeed,
    rememberQueued,
  ]);

  useEffect(() => {
    if (hasStarted) void maybeRefill();
  }, [currentIndex, hasStarted, maybeRefill]);

  useEffect(() => {
    setCurrentDurationSeconds(null);
  }, [currentItem?.trailer.id]);

  // Safety net: never let the "next up" overlay stick if onPlay never fires.
  useEffect(() => {
    if (!isTransitioning) return;
    const t = setTimeout(() => setIsTransitioning(false), TRANSITION_SAFETY_MS);
    return () => clearTimeout(t);
  }, [isTransitioning, currentIndex]);

  useEffect(() => {
    if (!autoplayMutedNotice) return;
    const t = setTimeout(
      () => setAutoplayMutedNotice(false),
      AUTOPLAY_MUTED_NOTICE_MS,
    );
    return () => clearTimeout(t);
  }, [autoplayMutedNotice]);

  // --- Playback control ----------------------------------------------------

  const advance = useCallback(() => {
    setIsDetailsOpen(false);
    setCurrentDurationSeconds(null);
    setIsTransitioning(true);
    setCurrentIndex((i) => Math.min(i + 1, queue.length));
  }, [queue.length]);

  const readWatchStats = () => ({
    watchSeconds: statsRef.current?.getWatchSeconds() ?? null,
    videoDuration: statsRef.current?.getDuration() ?? null,
  });

  const emit = useCallback(
    (eventType: Parameters<typeof trackEvent>[0]["eventType"], extra = {}) => {
      if (!anonymousUserId || !currentItem) return;
      void trackEvent({
        anonymousUserId,
        movieId: currentItem.movie.id,
        trailerId: currentItem.trailer.id,
        eventType,
        channel: selectedChannel,
        ...extra,
      });
    },
    [anonymousUserId, currentItem, selectedChannel],
  );

  const markConsumed = useCallback((movieId: number, watchSeconds: number) => {
    pushRecentlyWatched(movieId);
    sessionSeenRef.current.add(movieId);
    return watchSeconds;
  }, []);

  const handleEnded = useCallback(() => {
    const s = readWatchStats();
    emit("play_end", s);
    if (currentItem) markConsumed(currentItem.movie.id, s.watchSeconds ?? 0);
    setStats((p) => ({
      ...p,
      trailersWatched: p.trailersWatched + 1,
      watchSecondsTotal: p.watchSecondsTotal + (s.watchSeconds ?? 0),
      watchSamples: p.watchSamples + 1,
    }));
    advance();
  }, [emit, advance, currentItem, markConsumed]);

  const handleNext = useCallback(() => {
    const s = readWatchStats();
    emit("skip", s);
    if (currentItem) markConsumed(currentItem.movie.id, s.watchSeconds ?? 0);
    setStats((p) => ({
      ...p,
      trailersSkipped: p.trailersSkipped + 1,
      watchSecondsTotal: p.watchSecondsTotal + (s.watchSeconds ?? 0),
      watchSamples: p.watchSamples + 1,
    }));
    advance();
  }, [emit, advance, currentItem, markConsumed]);

  const handlePlay = useCallback(() => {
    // Reveal the player once the next trailer is actually rolling.
    setIsTransitioning(false);
    emit("play_start");
  }, [emit]);

  const handleDuration = useCallback(
    (seconds: number) => {
      setCurrentDurationSeconds(seconds);
      if (
        DATA_MODE !== "tmdb" ||
        !currentItem ||
        currentItem.source !== "tmdb" ||
        seconds < LONG_TRAILER_SECONDS
      ) {
        return;
      }

      setLongTrailerKeys((prev) => {
        if (prev.has(currentItem.trailer.videoKey)) return prev;
        const next = new Set([currentItem.trailer.videoKey, ...prev]);
        const compact = Array.from(next).slice(0, MAX_LONG_TRAILER_KEYS);
        try {
          window.localStorage.setItem(
            LONG_TRAILER_KEYS_STORAGE_KEY,
            JSON.stringify(compact),
          );
        } catch {
          // ignore storage failures; the UI label still works this session
        }
        return new Set(compact);
      });
    },
    [currentItem],
  );

  const handleError = useCallback(() => {
    advance();
  }, [advance]);

  // User-initiated mute toggles (button/keyboard) persist the preference so
  // the next visit tries the same audio state. Distinct from the autoplay
  // fallback below, which flips `muted` back to true without touching the
  // saved preference — a one-off autoplay block shouldn't erase the user's
  // "I want sound" choice for future visits.
  const toggleMuted = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      persist(MUTED_STORAGE_KEY, next ? "true" : "false");
      return next;
    });
  }, []);

  const handleAutoplayMuted = useCallback(() => {
    setMuted(true);
    setAutoplayMutedNotice(true);
  }, []);

  const handleLike = useCallback(() => {
    emit("like");
  }, [emit]);

  const handleDislike = useCallback(() => {
    emit("dislike");
    advance();
  }, [emit, advance]);

  const handleWatchlist = useCallback(() => {
    if (!anonymousUserId || !currentItem) return;
    const movieId = currentItem.movie.id;
    const isOn = watchlistedIds.has(movieId);

    setWatchlistedIds((prev) => {
      const next = new Set(prev);
      if (isOn) next.delete(movieId);
      else next.add(movieId);
      return next;
    });

    if (isOn) {
      void removeFromWatchlist(anonymousUserId, movieId);
      emit("watchlist_remove");
    } else {
      void addToWatchlist(anonymousUserId, movieId);
      emit("watchlist_add");
      setStats((p) => ({ ...p, watchlistAdds: p.watchlistAdds + 1 }));
    }
  }, [anonymousUserId, currentItem, watchlistedIds, emit]);

  const handleDetails = useCallback(() => {
    setIsDetailsOpen(true);
    emit("details_open");
  }, [emit]);

  const handleChannelChange = useCallback(
    async (channelId: string) => {
      if (channelId === selectedChannel || !anonymousUserId) return;
      setSelectedChannel(channelId);
      persist(CHANNEL_STORAGE_KEY, channelId);
      // Clear the session-seen set on channel change so the new channel's pool
      // isn't artificially reduced by items the old channel showed.
      sessionSeenRef.current.clear();
      void trackEvent({
        anonymousUserId,
        movieId: currentItem?.movie.id ?? 0,
        trailerId: currentItem?.trailer.id ?? 0,
        eventType: "channel_change",
        channel: channelId,
      });
      await runInitialLoad(anonymousUserId, channelId);
    },
    [selectedChannel, anonymousUserId, currentItem, runInitialLoad],
  );

  // --- Keyboard shortcuts --------------------------------------------------

  useEffect(() => {
    if (!hasStarted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          statsRef.current?.togglePlay();
          break;
        case "ArrowRight":
          e.preventDefault();
          handleNext();
          break;
        case "w":
        case "W":
          handleWatchlist();
          break;
        case "l":
        case "L":
          handleLike();
          break;
        case "d":
        case "D":
          handleDislike();
          break;
        case "m":
        case "M":
          toggleMuted();
          break;
        case "?":
          shortcuts.toggle();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    hasStarted,
    handleNext,
    handleWatchlist,
    handleLike,
    handleDislike,
    toggleMuted,
    shortcuts,
  ]);

  // --- Derived render state ------------------------------------------------

  const feedEmpty = !isLoading && !loadError && queue.length === 0;
  const reachedEnd = !isLoading && queue.length > 0 && !currentItem;
  const isWatchlisted = currentItem
    ? watchlistedIds.has(currentItem.movie.id)
    : false;
  const isLongTmdbTrailer =
    DATA_MODE === "tmdb" &&
    currentItem?.source === "tmdb" &&
    currentDurationSeconds !== null &&
    currentDurationSeconds >= LONG_TRAILER_SECONDS;

  const averageWatchSeconds =
    stats.watchSamples > 0 ? stats.watchSecondsTotal / stats.watchSamples : 0;
  const debugStats: DebugStats = {
    sessionStartedAt: sessionStartedAtRef.current,
    trailersWatched: stats.trailersWatched,
    trailersSkipped: stats.trailersSkipped,
    watchlistAdds: stats.watchlistAdds,
    averageWatchSeconds,
    currentQueueLength: Math.max(0, queue.length - currentIndex - 1),
  };

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden bg-lobby-bg">
      {/* Top bar */}
      <header className="z-20 flex items-center justify-between gap-3 border-b border-lobby-border/60 px-4 py-3">
        <Wordmark />
        <nav className="flex items-center gap-4 text-sm text-white/60">
          <Link href="/channels" className="hover:text-white">
            チャンネル
          </Link>
          <Link href="/watchlist" className="hover:text-white">
            観たいリスト
          </Link>
          <Link href="/about" className="hover:text-white">
            About
          </Link>
        </nav>
      </header>

      {/* Channel bar */}
      <div className="z-10 border-b border-lobby-border/40 px-3 py-2">
        {DATA_MODE === "tmdb" ? (
          <div className="mb-1 flex items-center gap-2 px-1 text-[11px] text-white/40">
            <span className="rounded bg-blue-500/20 px-1.5 py-0.5 font-medium text-blue-400">
              TMDb探索
            </span>
            <span>知らない映画に出会うための予告編フィード</span>
          </div>
        ) : DATA_MODE === "firehose" ? (
          <div className="mb-1 flex items-center gap-2 px-1 text-[11px] text-white/40">
            <span className="rounded bg-orange-500/20 px-1.5 py-0.5 font-medium text-orange-300">
              Firehose
            </span>
            <span>増え続ける予告編棚から、当たり外れごと浴びるモード</span>
          </div>
        ) : null}
        <ChannelSelector
          selected={selectedChannel}
          onSelect={handleChannelChange}
          channels={getChannelsForMode(DATA_MODE)}
        />
      </div>

      {/* Player + details */}
      <div className="relative flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex-1 bg-lobby-bg">
            {currentItem && hasStarted ? (
              <>
                <TrailerPlayer
                  key={currentItem.trailer.id}
                  videoKey={currentItem.trailer.videoKey}
                  autoplay
                  muted={muted}
                  onPlay={handlePlay}
                  onDuration={handleDuration}
                  onEnded={handleEnded}
                  onError={handleError}
                  onStats={(handle) => {
                    statsRef.current = handle;
                  }}
                  onAutoplayMuted={handleAutoplayMuted}
                />
                <NextUpOverlay
                  visible={isTransitioning}
                  title={currentItem.movie.title}
                />
                {autoplayMutedNotice ? (
                  <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full bg-black/80 px-4 py-2 text-xs text-white/90 shadow-lg ring-1 ring-white/15">
                    ブラウザによりミュートで開始しました
                  </div>
                ) : null}
                {isLongTmdbTrailer ? (
                  <div className="pointer-events-none absolute left-4 top-4 z-20 rounded bg-black/70 px-3 py-1.5 text-xs font-bold text-white shadow-lg ring-1 ring-white/15">
                    長めの予告 {formatDuration(currentDurationSeconds)}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center">
                {feedEmpty ? (
                  <div className="max-w-sm space-y-4">
                    <p className="text-white/70">
                      このチャンネルの予告編はまだ準備中です。
                    </p>
                    <p className="text-sm text-white/50">
                      別のチャンネルを選ぶと、すぐに再生がはじまります。
                    </p>
                    <Link
                      href="/channels"
                      className="inline-block rounded-full bg-accent px-6 py-2.5 text-sm font-bold text-accent-contrast transition hover:brightness-110"
                    >
                      チャンネルを選ぶ
                    </Link>
                  </div>
                ) : reachedEnd ? (
                  <div className="max-w-sm space-y-4">
                    <p className="text-white/70">
                      ここまでご視聴ありがとうございます。
                    </p>
                    <p className="text-sm text-white/50">
                      もう一周読み込むか、チャンネルを切り替えて新しい流れを楽しめます。
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (anonymousUserId) {
                          void runInitialLoad(
                            anonymousUserId,
                            selectedChannel,
                          );
                        }
                      }}
                      className="inline-block rounded-full bg-accent px-6 py-2.5 text-sm font-bold text-accent-contrast transition hover:brightness-110"
                    >
                      もう一度浴びる
                    </button>
                  </div>
                ) : hasStarted ? (
                  // StartOverlay covers the pre-start state, so this text only
                  // shows during the brief mid-session refill window.
                  <p className="animate-pulse text-white/40">
                    予告編を準備しています…
                  </p>
                ) : null}
              </div>
            )}

            {/* Mobile title overlay */}
            {currentItem && hasStarted ? (
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 lg:hidden">
                <h1 className="text-lg font-bold drop-shadow">
                  {currentItem.movie.title}
                </h1>
              </div>
            ) : null}
          </div>

          {/* Action bar */}
          <div className="safe-bottom border-t border-lobby-border/60 bg-lobby-bg">
            <ActionBar
              onNext={handleNext}
              onLike={handleLike}
              onDislike={handleDislike}
              onWatchlist={handleWatchlist}
              onDetails={handleDetails}
              onMuteToggle={toggleMuted}
              muted={muted}
              isWatchlisted={isWatchlisted}
            />
          </div>
        </section>

        {/* Details: desktop side panel + mobile sheet */}
        <MovieInfoPanel
          movie={currentItem?.movie ?? null}
          trailer={currentItem?.trailer ?? null}
          source={currentItem?.source}
          open={isDetailsOpen}
          onClose={() => setIsDetailsOpen(false)}
          onWatchlist={handleWatchlist}
          onLike={handleLike}
          isWatchlisted={isWatchlisted}
          hasStarted={hasStarted}
        />
      </div>

      {/* Loading / error gate — skip the full-screen overlay once playback
          has started so channel switches don't blank the screen. */}
      {loadError && !hasStarted ? (
        <LobbyLoading
          error
          onRetry={() => {
            if (anonymousUserId) {
              void runInitialLoad(
                anonymousUserId,
                selectedChannel,
              );
            }
          }}
        />
      ) : isLoading && !hasStarted ? (
        <LobbyLoading />
      ) : !hasStarted && !feedEmpty ? (
        <StartOverlay
          onStart={() => setHasStarted(true)}
          willStartUnmuted={!muted}
        />
      ) : null}

      {/* Dev tooling */}
      {hasStarted ? (
        <ShortcutsHelp open={shortcuts.open} onToggle={shortcuts.toggle} />
      ) : null}
      {DEBUG_ENABLED ? <DebugPanel stats={debugStats} /> : null}
    </main>
  );
}
