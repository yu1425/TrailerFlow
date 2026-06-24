/**
 * TMDb API client (server-only).
 *
 * Auth uses the v4 "API Read Access Token" as a Bearer token. Never import
 * this module from client components — TMDB_ACCESS_TOKEN must stay server-side.
 */

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/";

// ---------------------------------------------------------------------------
// Response shapes (only the fields we consume)
// ---------------------------------------------------------------------------

export interface TmdbMovieListItem {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  release_date: string;
  poster_path: string | null;
  backdrop_path: string | null;
  popularity: number;
  vote_average: number;
  vote_count: number;
  original_language: string;
  adult: boolean;
  genre_ids: number[];
}

export interface TmdbPaginatedResponse {
  page: number;
  total_pages: number;
  total_results: number;
  results: TmdbMovieListItem[];
}

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbMovieDetails {
  id: number;
  imdb_id: string | null;
  title: string;
  original_title: string;
  overview: string;
  release_date: string;
  runtime: number | null;
  poster_path: string | null;
  backdrop_path: string | null;
  popularity: number;
  vote_average: number;
  vote_count: number;
  original_language: string;
  adult: boolean;
  status: string;
  homepage: string | null;
  genres: TmdbGenre[];
}

export interface TmdbVideo {
  id: string;
  iso_639_1: string;
  iso_3166_1: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
  published_at: string;
}

export interface TmdbVideosResponse {
  id: number;
  results: TmdbVideo[];
}

// ---------------------------------------------------------------------------
// Core fetch
// ---------------------------------------------------------------------------

function getAccessToken(): string {
  const token = process.env.TMDB_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Missing TMDB_ACCESS_TOKEN environment variable");
  }
  return token;
}

export async function tmdbFetch<T>(
  path: string,
  params: Record<string, string | number | boolean> = {},
): Promise<T> {
  const url = new URL(`${TMDB_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      Accept: "application/json",
    },
    // TMDb data changes slowly; cache lightly. Sync routes pass through here
    // too but we re-fetch fresh in those flows by design (server runtime).
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `TMDb request failed: ${res.status} ${res.statusText} for ${path} ${body}`,
    );
  }

  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Endpoint helpers
// ---------------------------------------------------------------------------

export async function getGenres(language = "ja-JP"): Promise<TmdbGenre[]> {
  const data = await tmdbFetch<{ genres: TmdbGenre[] }>("/genre/movie/list", {
    language,
  });
  return data.genres;
}

export function getPopularMovies(
  page = 1,
  language = "ja-JP",
  region = "JP",
): Promise<TmdbPaginatedResponse> {
  return tmdbFetch<TmdbPaginatedResponse>("/movie/popular", {
    page,
    language,
    region,
  });
}

export function getNowPlayingMovies(
  page = 1,
  language = "ja-JP",
  region = "JP",
): Promise<TmdbPaginatedResponse> {
  return tmdbFetch<TmdbPaginatedResponse>("/movie/now_playing", {
    page,
    language,
    region,
  });
}

export function getUpcomingMovies(
  page = 1,
  language = "ja-JP",
  region = "JP",
): Promise<TmdbPaginatedResponse> {
  return tmdbFetch<TmdbPaginatedResponse>("/movie/upcoming", {
    page,
    language,
    region,
  });
}

export function getTopRatedMovies(
  page = 1,
  language = "ja-JP",
  region = "JP",
): Promise<TmdbPaginatedResponse> {
  return tmdbFetch<TmdbPaginatedResponse>("/movie/top_rated", {
    page,
    language,
    region,
  });
}

export function getMovieDetails(
  tmdbId: number,
  language = "ja-JP",
): Promise<TmdbMovieDetails> {
  return tmdbFetch<TmdbMovieDetails>(`/movie/${tmdbId}`, { language });
}

export function getMovieVideos(
  tmdbId: number,
  language = "ja-JP",
): Promise<TmdbVideosResponse> {
  return tmdbFetch<TmdbVideosResponse>(`/movie/${tmdbId}/videos`, { language });
}

/**
 * Builds an absolute image URL. Centralised so we can later swap in the
 * configuration API base/sizes without touching call sites.
 */
export function getImageUrl(path: string | null, size = "w500"): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}${size}${path}`;
}

// ---------------------------------------------------------------------------
// Trailer selection
// ---------------------------------------------------------------------------

const LANGUAGE_PRIORITY = ["ja-JP", "ja", "en-US", "en"];

const NAME_KEYWORDS = ["official trailer", "本予告", "予告", "trailer"];

function languageRank(video: TmdbVideo): number {
  const tag = `${video.iso_639_1}-${video.iso_3166_1}`;
  const idxFull = LANGUAGE_PRIORITY.indexOf(tag);
  if (idxFull !== -1) return idxFull;
  const idxLang = LANGUAGE_PRIORITY.indexOf(video.iso_639_1);
  return idxLang !== -1 ? idxLang : LANGUAGE_PRIORITY.length;
}

function nameRank(video: TmdbVideo): number {
  const lower = video.name.toLowerCase();
  const idx = NAME_KEYWORDS.findIndex((kw) => lower.includes(kw.toLowerCase()));
  return idx === -1 ? NAME_KEYWORDS.length : idx;
}

/**
 * Picks the single best YouTube trailer from a list of TMDb videos.
 *
 * Priority (most important first):
 *  1. site === YouTube only
 *  2. type === Trailer preferred over teasers/clips
 *  3. official === true preferred
 *  4. language order ja-JP, ja, en-US, en
 *  5. matching name keywords (Official Trailer / 本予告 / 予告 / Trailer)
 *  6. newer published_at
 */
export function pickBestTrailer(videos: TmdbVideo[]): TmdbVideo | null {
  const youtube = videos.filter((v) => v.site === "YouTube" && v.key);
  if (youtube.length === 0) return null;

  const sorted = [...youtube].sort((a, b) => {
    // Trailer type first.
    const aTrailer = a.type === "Trailer" ? 0 : 1;
    const bTrailer = b.type === "Trailer" ? 0 : 1;
    if (aTrailer !== bTrailer) return aTrailer - bTrailer;

    // Official first.
    const aOfficial = a.official ? 0 : 1;
    const bOfficial = b.official ? 0 : 1;
    if (aOfficial !== bOfficial) return aOfficial - bOfficial;

    // Language priority.
    const langDiff = languageRank(a) - languageRank(b);
    if (langDiff !== 0) return langDiff;

    // Name keyword match.
    const nameDiff = nameRank(a) - nameRank(b);
    if (nameDiff !== 0) return nameDiff;

    // Newest published first.
    const aTime = a.published_at ? Date.parse(a.published_at) : 0;
    const bTime = b.published_at ? Date.parse(b.published_at) : 0;
    return bTime - aTime;
  });

  return sorted[0] ?? null;
}
