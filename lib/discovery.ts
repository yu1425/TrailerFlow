import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ContentType,
  DiscoverySourceRow,
  DiscoverySourceType,
} from "@/types/content";
import {
  discoverMovies,
  getMovieVideos,
  getNowPlayingMovies,
  getPopularMovies,
  getTopRatedMovies,
  getUpcomingMovies,
  pickBestTrailer,
  type TmdbMovieListItem,
  type TmdbPaginatedResponse,
} from "@/lib/tmdb";
import {
  fetchYouTubeVideoMetadata,
  getDurationBucket,
  getYouTubeThumbnail,
  getYouTubeWatchUrl,
} from "@/lib/youtubeCandidate";

export const DISCOVERY_SOURCE_TYPES: DiscoverySourceType[] = [
  "tmdb_list",
  "tmdb_genre",
  "youtube_channel",
  "youtube_search",
  "rating_list",
  "festival_awards",
  "celebrity_recommendations",
  "manual_seed",
];

const BLOCKED_TITLE_PATTERNS = [
  /reaction/i,
  /review/i,
  /commentary/i,
  /interview/i,
  /behind\s+the\s+scenes/i,
  /making\s+of/i,
  /解説/,
  /考察/,
  /レビュー/,
  /リアクション/,
  /インタビュー/,
  /メイキング/,
];

const TRAILER_TITLE_PATTERNS = [
  /trailer/i,
  /teaser/i,
  /\bpv\b/i,
  /予告/,
  /本予告/,
  /特報/,
  /ティザー/,
  /プロモーション映像/,
];

interface YouTubeSearchItem {
  id: { kind: string; videoId?: string };
  snippet: {
    title: string;
    description: string;
    channelId: string;
    channelTitle: string;
    publishedAt: string;
  };
}

interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
  nextPageToken?: string;
}

interface FirehoseCandidate {
  title: string;
  overview?: string | null;
  contentType: ContentType;
  source: "youtube" | "tmdb";
  sourceType: DiscoverySourceType;
  discoveryReason: string;
  youtubeVideoKey: string;
  trailerTitle?: string | null;
  trailerType?: string | null;
  channelTitle?: string | null;
  channelId?: string | null;
  language?: string | null;
  publishedAt?: string | null;
  durationSeconds?: number | null;
  tags: string[];
  warningFlags: string[];
  sourceUrl?: string | null;
  autoScore: number;
}

export interface DiscoveryRunResult {
  collectedCount: number;
  duplicateCount: number;
  skippedCount: number;
  errorCount: number;
  errorMessage: string | null;
  cursorBefore: string | null;
  cursorAfter: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringParam(
  params: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function intParam(
  params: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = params[key];
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function contentTypeParam(
  params: Record<string, unknown>,
  fallback: ContentType = "movie",
): ContentType {
  const value = params.content_type;
  return value === "movie" ||
    value === "anime" ||
    value === "game" ||
    value === "tv" ||
    value === "travel" ||
    value === "restaurant"
    ? value
    : fallback;
}

function isNoiseTitle(title: string): boolean {
  return BLOCKED_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}

function isTrailerLikeTitle(title: string): boolean {
  return TRAILER_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}

function cleanMovieTitle(title: string): string {
  return (
    title
      .replace(
        /[\s\-|:：]+(official\s+)?(本予告|予告|特報|ティザー|trailer|teaser|pv|プロモーション映像).*/i,
        "",
      )
      .trim() || title
  );
}

function computeAutoScore(candidate: FirehoseCandidate): number {
  let score = 50;
  if (candidate.trailerType === "Trailer") score += 8;
  if (candidate.durationSeconds != null) {
    const bucket = getDurationBucket(candidate.durationSeconds);
    if (bucket === "ideal") score += 12;
    if (bucket === "long") score += 2;
    if (bucket === "very_long") score -= 10;
    if (bucket === "short") score -= 4;
  }
  score -= candidate.warningFlags.length * 8;
  return Math.min(100, Math.max(0, score));
}

async function fetchYouTubeSearch(
  params: {
    query?: string | null;
    channelId?: string | null;
    pageToken?: string | null;
    maxResults: number;
  },
): Promise<YouTubeSearchResponse> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing YOUTUBE_API_KEY for YouTube discovery source");
  }
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("order", "date");
  url.searchParams.set("maxResults", String(params.maxResults));
  url.searchParams.set("key", apiKey);
  if (params.query) url.searchParams.set("q", params.query);
  if (params.channelId) url.searchParams.set("channelId", params.channelId);
  if (params.pageToken) url.searchParams.set("pageToken", params.pageToken);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YouTube search failed: ${res.status} ${body}`);
  }
  return (await res.json()) as YouTubeSearchResponse;
}

async function buildYouTubeCandidates(
  source: DiscoverySourceRow,
): Promise<{ candidates: FirehoseCandidate[]; cursorAfter: string | null }> {
  const params = asRecord(source.params);
  const maxResults = Math.min(50, Math.max(1, intParam(params, "batch_size", 25)));
  const data = await fetchYouTubeSearch({
    query: source.source_type === "youtube_search" ? source.query : null,
    channelId: source.source_type === "youtube_channel" ? source.query : null,
    pageToken: source.next_cursor,
    maxResults,
  });

  const candidates: FirehoseCandidate[] = [];
  for (const item of data.items ?? []) {
    const videoKey = item.id.videoId;
    if (!videoKey) continue;
    const title = item.snippet.title;
    const warningFlags: string[] = [];
    if (isNoiseTitle(title)) {
      warningFlags.push("noise_title");
      continue;
    }
    if (!isTrailerLikeTitle(title)) warningFlags.push("not_obvious_trailer");

    const metadata = await fetchYouTubeVideoMetadata(videoKey);
    const contentType = contentTypeParam(params);
    const tags = [
      contentType,
      "auto_collected",
      source.source_type,
      ...(isTrailerLikeTitle(title) ? ["trailer"] : ["needs_review"]),
    ];
    const candidate: FirehoseCandidate = {
      title: cleanMovieTitle(title),
      overview: item.snippet.description?.slice(0, 1000) || null,
      contentType,
      source: "youtube",
      sourceType: source.source_type,
      discoveryReason: source.name,
      youtubeVideoKey: videoKey,
      trailerTitle: title,
      trailerType: isTrailerLikeTitle(title) ? "Trailer" : "Unknown",
      channelTitle: item.snippet.channelTitle,
      channelId: item.snippet.channelId,
      language: stringParam(params, "language", "ja"),
      publishedAt: item.snippet.publishedAt,
      durationSeconds: metadata.durationSeconds,
      tags,
      warningFlags,
      sourceUrl: getYouTubeWatchUrl(videoKey),
      autoScore: 50,
    };
    candidate.autoScore = computeAutoScore(candidate);
    candidates.push(candidate);
  }

  return {
    candidates,
    cursorAfter: data.nextPageToken ?? null,
  };
}

async function fetchTmdbList(
  listName: string,
  page: number,
  language: string,
  region: string,
): Promise<TmdbPaginatedResponse> {
  if (listName === "top_rated") return getTopRatedMovies(page, language, region);
  if (listName === "upcoming") return getUpcomingMovies(page, language, region);
  if (listName === "now_playing") {
    return getNowPlayingMovies(page, language, region);
  }
  return getPopularMovies(page, language, region);
}

async function buildTmdbCandidates(
  source: DiscoverySourceRow,
): Promise<{ candidates: FirehoseCandidate[]; cursorAfter: string | null }> {
  const params = asRecord(source.params);
  const page = Number.parseInt(source.next_cursor ?? "1", 10) || 1;
  const language = stringParam(params, "language", "ja-JP");
  const region = stringParam(params, "region", "JP");
  const listName = source.query || stringParam(params, "list", "popular");
  const contentType = contentTypeParam(params, "movie");

  const response =
    source.source_type === "tmdb_genre"
      ? await discoverMovies(page, language, region, {
          with_genres: source.query || stringParam(params, "genre_id", ""),
          sort_by: stringParam(params, "sort_by", "popularity.desc"),
        })
      : await fetchTmdbList(listName, page, language, region);

  const candidates: FirehoseCandidate[] = [];
  for (const movie of response.results) {
    if (movie.adult) continue;
    const videos = await getMovieVideos(movie.id, language).catch(() => null);
    const fallbackVideos =
      language !== "en-US"
        ? await getMovieVideos(movie.id, "en-US").catch(() => null)
        : null;
    const best = pickBestTrailer([
      ...(videos?.results ?? []),
      ...(fallbackVideos?.results ?? []),
    ]);
    if (!best || best.site !== "YouTube") continue;
    if (isNoiseTitle(best.name)) continue;

    const tags = [
      contentType,
      "auto_collected",
      "tmdb",
      source.source_type,
      ...movie.genre_ids.map((id) => `tmdb_genre:${id}`),
    ];
    const candidate: FirehoseCandidate = {
      title: movie.title || movie.original_title,
      overview: movie.overview || null,
      contentType,
      source: "tmdb",
      sourceType: source.source_type,
      discoveryReason: `${source.name}: ${listName}`,
      youtubeVideoKey: best.key,
      trailerTitle: best.name,
      trailerType: best.type || "Trailer",
      language: best.iso_639_1 || null,
      publishedAt: best.published_at || null,
      durationSeconds: null,
      tags,
      warningFlags: best.official ? [] : ["official_unknown"],
      sourceUrl: getYouTubeWatchUrl(best.key),
      autoScore: 50,
    };
    candidate.autoScore = computeAutoScore(candidate);
    candidates.push(candidate);
  }

  const nextPage = page >= response.total_pages ? 1 : page + 1;
  return { candidates, cursorAfter: String(nextPage) };
}

async function saveCandidate(
  supabase: SupabaseClient,
  candidate: FirehoseCandidate,
): Promise<"collected" | "duplicate" | "skipped"> {
  const { data: existing } = await supabase
    .from("content_trailers")
    .select("id")
    .eq("youtube_video_key", candidate.youtubeVideoKey)
    .maybeSingle();
  if (existing) return "duplicate";

  const thumbnailUrl = getYouTubeThumbnail(candidate.youtubeVideoKey);
  const { data: content, error: contentError } = await supabase
    .from("contents")
    .insert({
      content_type: candidate.contentType,
      title: candidate.title,
      overview: candidate.overview ?? null,
      short_copy: "",
      language: candidate.language ?? "ja",
      thumbnail_url: thumbnailUrl,
      poster_url: thumbnailUrl,
      source: candidate.source,
      curation_status: "candidate",
      quality_score: candidate.autoScore,
      firehose_visible: true,
      auto_collected: true,
      auto_score: candidate.autoScore,
      warning_flags: candidate.warningFlags,
      source_type: candidate.sourceType,
      discovery_reason: candidate.discoveryReason,
      is_active: true,
    })
    .select("id")
    .single();

  if (contentError || !content) {
    throw new Error(contentError?.message ?? "content insert failed");
  }

  const contentId = content.id as number;
  const { error: trailerError } = await supabase.from("content_trailers").insert({
    content_id: contentId,
    youtube_video_key: candidate.youtubeVideoKey,
    title: candidate.trailerTitle ?? candidate.title,
    channel_title: candidate.channelTitle ?? null,
    channel_id: candidate.channelId ?? null,
    language: candidate.language ?? "ja",
    type: candidate.trailerType ?? "Trailer",
    official: null,
    official_level: candidate.warningFlags.includes("official_unknown")
      ? "unknown"
      : "unknown",
    embed_status: "unknown",
    source_url: candidate.sourceUrl ?? getYouTubeWatchUrl(candidate.youtubeVideoKey),
    duration_seconds: candidate.durationSeconds ?? null,
    thumbnail_url: thumbnailUrl,
    firehose_visible: true,
    auto_collected: true,
    auto_score: candidate.autoScore,
    warning_flags: candidate.warningFlags,
    source_type: candidate.sourceType,
    discovery_reason: candidate.discoveryReason,
    published_at: candidate.publishedAt ?? null,
    is_active: true,
  });
  if (trailerError) throw new Error(trailerError.message);

  if (candidate.tags.length > 0) {
    await supabase.from("content_tags").insert(
      Array.from(new Set(candidate.tags)).map((tag) => ({
        content_id: contentId,
        tag,
      })),
    );
  }

  return "collected";
}

export async function runDiscoverySource(
  supabase: SupabaseClient,
  source: DiscoverySourceRow,
): Promise<DiscoveryRunResult> {
  const cursorBefore = source.next_cursor;
  const result: DiscoveryRunResult = {
    collectedCount: 0,
    duplicateCount: 0,
    skippedCount: 0,
    errorCount: 0,
    errorMessage: null,
    cursorBefore,
    cursorAfter: cursorBefore,
  };

  try {
    let built: { candidates: FirehoseCandidate[]; cursorAfter: string | null };
    if (source.source_type === "youtube_channel" || source.source_type === "youtube_search") {
      built = await buildYouTubeCandidates(source);
    } else if (source.source_type === "tmdb_list" || source.source_type === "tmdb_genre") {
      built = await buildTmdbCandidates(source);
    } else {
      throw new Error(`${source.source_type} collector is not implemented yet`);
    }

    result.cursorAfter = built.cursorAfter;

    for (const candidate of built.candidates) {
      try {
        const saved = await saveCandidate(supabase, candidate);
        if (saved === "collected") result.collectedCount++;
        else if (saved === "duplicate") result.duplicateCount++;
        else result.skippedCount++;
      } catch (err) {
        result.errorCount++;
        result.errorMessage = (err as Error).message;
      }
    }
  } catch (err) {
    result.errorCount++;
    result.errorMessage = (err as Error).message;
  }

  return result;
}
