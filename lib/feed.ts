import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedItem } from "@/types/trailer";
import type { TrailerRow } from "@/types/trailer";
import { getImageUrl } from "@/lib/tmdb";

/**
 * Feed building: turns the movies + trailers tables into a personalised,
 * shuffled queue of playable items for /api/feed.
 */

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export interface ChannelConfig {
  /** Restrict to these TMDb genre ids (used only in TMDb mode). */
  genres?: number[];
  /** Restrict to this original language (ISO 639-1), e.g. "ja". */
  language?: string;
  /** Only items released on/after this many years ago. */
  recentYears?: number;
  /** Ordering bias. */
  sort?: "balanced" | "popularity" | "release" | "random";

  // --- Content mode (manual/mixed) filters. ---------------------------------
  // These match against content_tags (which includes both genres and tags from
  // the CSV) and the contents.content_type column.

  /** Match items that have ANY of these strings in content_tags. */
  contentTags?: string[];
  /** Match items whose content_type is one of these values. */
  contentTypes?: string[];
  /** Match items whose country column is one of these values. */
  contentCountries?: string[];
}

export interface ChannelDefinition {
  id: string;
  name: string;
  description: string;
  config: ChannelConfig;
  /** When false, the channel is hidden from the public UI but still usable via API. */
  visible?: boolean;
}

/**
 * Channel definitions. Each channel's `config` drives both the TMDb feed
 * (via `genres`/`language`) and the curated content feed (via `contentTags`/
 * `contentTypes`/`contentCountries`). The content filters match against
 * content_tags rows, which contain both genres and freeform tags from the CSV.
 */
export const CHANNELS: ChannelDefinition[] = [
  {
    id: "lobby",
    name: "ロビー",
    description: "いま注目の予告編をバランスよく",
    config: { sort: "balanced" },
    visible: true,
  },
  {
    id: "new",
    name: "新作予告",
    description: "これから公開される最新の予告編",
    config: {
      recentYears: 2,
      sort: "release",
      contentTags: ["新作", "2020年代", "話題作"],
    },
    visible: false,
  },
  {
    id: "popular",
    name: "人気",
    description: "話題作の予告編を中心に",
    config: { sort: "popularity", contentTags: ["話題作", "名作", "アカデミー賞", "カンヌ"] },
    visible: false,
  },
  {
    id: "japanese",
    name: "日本映画",
    description: "邦画・日本語作品の予告編",
    config: {
      language: "ja",
      contentTags: ["邦画", "日本映画"],
      contentCountries: ["JP"],
    },
    visible: true,
  },
  {
    id: "action",
    name: "アクション",
    description: "アクション・SF映画の予告編",
    config: {
      genres: [28],
      contentTags: ["アクション", "SF", "アクションアドベンチャー", "アクションRPG", "スパイ", "特撮", "スタント", "カーアクション"],
    },
    visible: true,
  },
  {
    id: "romance",
    name: "恋愛",
    description: "恋愛・青春作品の予告編",
    config: {
      genres: [10749],
      contentTags: ["ロマンス", "ラブストーリー", "恋愛", "青春", "初恋"],
    },
    visible: false,
  },
  {
    id: "horror",
    name: "ホラー",
    description: "ホラー・サスペンス作品の予告編",
    config: {
      genres: [27],
      contentTags: ["ホラー", "サスペンス", "ゾンビ", "狂気", "ゴシック", "R指定"],
    },
    visible: false,
  },
  {
    id: "animation",
    name: "アニメ",
    description: "アニメーション作品の予告編",
    config: { genres: [16], contentTypes: ["anime"] },
    visible: true,
  },
  {
    id: "game",
    name: "ゲーム",
    description: "ゲーム作品の予告編",
    config: { contentTypes: ["game"] },
    visible: true,
  },
  {
    id: "random",
    name: "ランダム",
    description: "気分を変えてランダムに",
    config: { sort: "random" },
    visible: true,
  },
];

/** Channels visible in the public UI (player bar, /channels page). */
export const VISIBLE_CHANNELS = CHANNELS.filter((c) => c.visible !== false);

export function getChannel(id: string | null | undefined): ChannelDefinition {
  return CHANNELS.find((c) => c.id === id) ?? CHANNELS[0];
}

// ---------------------------------------------------------------------------
// Trailer selection from stored rows
// ---------------------------------------------------------------------------

const DEFAULT_LANGUAGE_PRIORITY = ["ja-JP", "ja", "en-US", "en"];
const NAME_KEYWORDS = ["official trailer", "本予告", "予告", "trailer"];

/**
 * Builds the language preference order. `preferred` is an ISO 639-1 code
 * (e.g. "ja", "en"); its variants are floated to the top, everything else
 * keeps the default order.
 */
export function buildLanguagePriority(preferred?: string | null): string[] {
  if (!preferred) return DEFAULT_LANGUAGE_PRIORITY;
  const matches = DEFAULT_LANGUAGE_PRIORITY.filter((l) =>
    l.startsWith(preferred),
  );
  const rest = DEFAULT_LANGUAGE_PRIORITY.filter(
    (l) => !l.startsWith(preferred),
  );
  return matches.length > 0 ? [...matches, ...rest] : DEFAULT_LANGUAGE_PRIORITY;
}

function rowLanguageRank(t: TrailerRow, priority: string[]): number {
  const lang = t.language ?? "";
  const idx = priority.indexOf(lang);
  if (idx !== -1) return idx;
  const base = priority.findIndex((p) => lang.startsWith(p));
  return base !== -1 ? base : priority.length;
}

function rowNameRank(t: TrailerRow): number {
  const lower = (t.name ?? "").toLowerCase();
  const idx = NAME_KEYWORDS.findIndex((kw) => lower.includes(kw.toLowerCase()));
  return idx === -1 ? NAME_KEYWORDS.length : idx;
}

/** Picks the best stored YouTube trailer for a movie (same rules as TMDb pick). */
export function pickBestTrailerRow(
  trailers: TrailerRow[],
  languagePriority: string[] = DEFAULT_LANGUAGE_PRIORITY,
): TrailerRow | null {
  const youtube = trailers.filter(
    (t) => t.site === "YouTube" && t.is_active !== false && t.video_key,
  );
  if (youtube.length === 0) return null;

  return [...youtube].sort((a, b) => {
    const aT = a.type === "Trailer" ? 0 : 1;
    const bT = b.type === "Trailer" ? 0 : 1;
    if (aT !== bT) return aT - bT;

    const aO = a.official ? 0 : 1;
    const bO = b.official ? 0 : 1;
    if (aO !== bO) return aO - bO;

    const langDiff =
      rowLanguageRank(a, languagePriority) - rowLanguageRank(b, languagePriority);
    if (langDiff !== 0) return langDiff;

    const nameDiff = rowNameRank(a) - rowNameRank(b);
    if (nameDiff !== 0) return nameDiff;

    const aTime = a.published_at ? Date.parse(a.published_at) : 0;
    const bTime = b.published_at ? Date.parse(b.published_at) : 0;
    return bTime - aTime;
  })[0];
}

// ---------------------------------------------------------------------------
// Feed building
// ---------------------------------------------------------------------------

interface MovieWithRelations {
  id: number;
  tmdb_id: number;
  title: string;
  overview: string | null;
  release_date: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  popularity: number | null;
  original_language: string | null;
  adult: boolean | null;
  trailers: TrailerRow[];
  movie_genres: { genres: { id: number; name: string } | null }[];
}

const MOVIE_SELECT = `
  id, tmdb_id, title, overview, release_date, poster_path, backdrop_path,
  popularity, original_language, adult,
  trailers!inner ( id, movie_id, site, video_key, name, type, official, published_at, language, country, is_active, created_at ),
  movie_genres ( genres ( id, name ) )
`;

const POOL_SIZE = 160;

interface BuildFeedOptions {
  anonymousUserId: string;
  channel?: string | null;
  limit?: number;
  /** Preferred trailer language (ISO 639-1), e.g. "ja" or "en". */
  preferredLanguage?: string | null;
  /** Movie ids to strongly exclude (recently watched on this client). */
  excludeMovieIds?: number[];
}

interface ProfileSubset {
  watched_movie_ids: number[];
  liked_movie_ids: number[];
  genre_weights: Record<string, number>;
}

async function loadProfile(
  supabase: SupabaseClient,
  anonymousUserId: string,
): Promise<ProfileSubset> {
  const { data } = await supabase
    .from("anonymous_profiles")
    .select("watched_movie_ids, liked_movie_ids, genre_weights")
    .eq("anonymous_user_id", anonymousUserId)
    .maybeSingle();

  return {
    watched_movie_ids: data?.watched_movie_ids ?? [],
    liked_movie_ids: data?.liked_movie_ids ?? [],
    genre_weights: data?.genre_weights ?? {},
  };
}

/** Build the candidate query for a channel. `relaxed` drops channel filters. */
async function fetchPool(
  supabase: SupabaseClient,
  channelConfig: ChannelConfig,
  relaxed: boolean,
  excludeMovieIds: number[] = [],
): Promise<MovieWithRelations[]> {
  let query = supabase
    .from("movies")
    .select(MOVIE_SELECT)
    .eq("adult", false)
    .eq("trailers.site", "YouTube")
    .eq("trailers.is_active", true);

  // Hard-exclude recently watched movies in the strict pass; the relaxed pass
  // drops this so we can still fill the queue when the pool is exhausted.
  if (!relaxed && excludeMovieIds.length > 0) {
    query = query.not("id", "in", `(${excludeMovieIds.join(",")})`);
  }

  if (!relaxed) {
    if (channelConfig.language) {
      query = query.eq("original_language", channelConfig.language);
    }
    if (channelConfig.recentYears) {
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - channelConfig.recentYears);
      query = query.gte("release_date", cutoff.toISOString().slice(0, 10));
    }
    if (channelConfig.genres && channelConfig.genres.length > 0) {
      // Resolve matching movie ids via the join table so we can keep full
      // genre lists in the display payload.
      const { data: mg } = await supabase
        .from("movie_genres")
        .select("movie_id")
        .in("genre_id", channelConfig.genres)
        .limit(1000);
      const ids = Array.from(new Set((mg ?? []).map((r) => r.movie_id)));
      if (ids.length === 0) return [];
      query = query.in("id", ids);
    }
  }

  // Order the candidate pool. We always pull by popularity (or release for the
  // "new"/"release" sort) then re-rank/shuffle in memory.
  if (channelConfig.sort === "release") {
    query = query.order("release_date", { ascending: false, nullsFirst: false });
  } else {
    query = query.order("popularity", { ascending: false, nullsFirst: false });
  }

  const { data, error } = await query.limit(POOL_SIZE);
  if (error) throw error;
  return (data ?? []) as unknown as MovieWithRelations[];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Scores a movie. Higher is better. Combines popularity, learned genre
 * weights and randomness, with a penalty for already-watched movies so they
 * sink to the bottom but can still backfill when the pool is thin.
 */
function scoreMovie(
  movie: MovieWithRelations,
  profile: ProfileSubset,
  config: ChannelConfig,
  watchedSet: Set<number>,
): number {
  if (config.sort === "random") {
    return Math.random();
  }

  const popularity = movie.popularity ?? 0;
  // Log-compress popularity so a few blockbusters don't dominate entirely.
  const popScore = Math.log10(popularity + 1);

  let genreScore = 0;
  for (const mg of movie.movie_genres) {
    const gid = mg.genres?.id;
    if (gid != null && profile.genre_weights[String(gid)]) {
      genreScore += profile.genre_weights[String(gid)];
    }
  }

  const randomness = Math.random() * 3; // dominant term → guarantees variety
  const popWeight = config.sort === "popularity" ? 1.2 : 0.6;

  let score = popScore * popWeight + genreScore * 0.5 + randomness;

  if (watchedSet.has(movie.id)) {
    score -= 100; // sink watched movies; still usable as fallback
  }

  return score;
}

function toFeedItem(
  movie: MovieWithRelations,
  languagePriority: string[],
): FeedItem | null {
  const best = pickBestTrailerRow(movie.trailers, languagePriority);
  if (!best) return null;

  const genres = movie.movie_genres
    .map((mg) => mg.genres?.name)
    .filter((n): n is string => Boolean(n));

  return {
    movie: {
      id: movie.id,
      tmdbId: movie.tmdb_id,
      title: movie.title,
      overview: movie.overview,
      releaseDate: movie.release_date,
      posterUrl: getImageUrl(movie.poster_path, "w500"),
      backdropUrl: getImageUrl(movie.backdrop_path, "w1280"),
      genres,
    },
    trailer: {
      id: best.id,
      site: "YouTube",
      videoKey: best.video_key,
      name: best.name,
      language: best.language,
    },
  };
}

/**
 * Builds a personalised, shuffled feed. Relaxes channel filters if the strict
 * query can't fill the requested limit.
 */
export async function buildFeed(
  supabase: SupabaseClient,
  options: BuildFeedOptions,
): Promise<FeedItem[]> {
  const { anonymousUserId, limit = 10 } = options;
  const channel = getChannel(options.channel);
  const config = channel.config;
  const languagePriority = buildLanguagePriority(options.preferredLanguage);
  const excludeMovieIds = options.excludeMovieIds ?? [];

  const profile = await loadProfile(supabase, anonymousUserId);
  const watchedSet = new Set(profile.watched_movie_ids);

  const seen = new Set<number>();
  const collected: FeedItem[] = [];

  const rankAndCollect = (pool: MovieWithRelations[]) => {
    const ranked = pool
      .map((m) => ({ m, score: scoreMovie(m, profile, config, watchedSet) }))
      .sort((a, b) => b.score - a.score);

    for (const { m } of ranked) {
      if (collected.length >= limit) break;
      if (seen.has(m.id)) continue;
      const item = toFeedItem(m, languagePriority);
      if (!item) continue;
      seen.add(m.id);
      collected.push(item);
    }
  };

  // Pass 1: strict channel filters + recently-watched exclusion.
  let pool = await fetchPool(supabase, config, false, excludeMovieIds);
  if (config.sort === "random") pool = shuffle(pool);
  rankAndCollect(pool);

  // Pass 2: relax channel filters if we couldn't fill the queue. We still skip
  // excluded ids here via `seen` so the strict-excluded ones only reappear once
  // genuinely nothing else is left.
  if (collected.length < limit) {
    for (const id of excludeMovieIds) seen.add(id);
    const relaxedPool = await fetchPool(supabase, config, true);
    rankAndCollect(shuffle(relaxedPool));
  }

  // Pass 3: last resort — allow recently watched back in rather than returning
  // an empty queue, so continuous playback never dead-ends.
  if (collected.length === 0) {
    seen.clear();
    const relaxedPool = await fetchPool(supabase, config, true);
    rankAndCollect(shuffle(relaxedPool));
  }

  return collected;
}
