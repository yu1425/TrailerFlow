import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getGenres,
  getMovieDetails,
  getMovieVideos,
  getNowPlayingMovies,
  getPopularMovies,
  getTopRatedMovies,
  getUpcomingMovies,
  pickBestTrailer,
  type TmdbMovieListItem,
  type TmdbPaginatedResponse,
  type TmdbVideo,
} from "@/lib/tmdb";

/**
 * TMDb → Supabase sync. Used by POST /api/admin/sync/tmdb and the
 * scripts/sync-tmdb.ts CLI. Best-effort: per-movie failures are logged and
 * skipped so one bad record doesn't abort the whole run.
 */

export interface SyncOptions {
  /** Pages to pull from each list endpoint. Default 1. */
  pages?: number;
  language?: string;
  region?: string;
  /** Fallback language used when no trailer is found in `language`. */
  fallbackLanguage?: string;
}

export interface SyncResult {
  genres: number;
  moviesProcessed: number;
  moviesUpserted: number;
  trailersUpserted: number;
  errors: string[];
}

type ListFetcher = (
  page: number,
  language: string,
  region: string,
) => Promise<TmdbPaginatedResponse>;

const LIST_FETCHERS: { label: string; fn: ListFetcher }[] = [
  { label: "popular", fn: getPopularMovies },
  { label: "now_playing", fn: getNowPlayingMovies },
  { label: "upcoming", fn: getUpcomingMovies },
  { label: "top_rated", fn: getTopRatedMovies },
];

async function syncGenres(
  supabase: SupabaseClient,
  language: string,
): Promise<number> {
  const genres = await getGenres(language);
  if (genres.length === 0) return 0;
  const { error } = await supabase
    .from("genres")
    .upsert(genres.map((g) => ({ id: g.id, name: g.name })), {
      onConflict: "id",
    });
  if (error) throw error;
  return genres.length;
}

/** Collects a de-duplicated set of movie ids across all list endpoints. */
async function collectMovieIds(
  pages: number,
  language: string,
  region: string,
  errors: string[],
): Promise<number[]> {
  const ids = new Set<number>();
  for (const { label, fn } of LIST_FETCHERS) {
    for (let page = 1; page <= pages; page++) {
      try {
        const res = await fn(page, language, region);
        res.results.forEach((m: TmdbMovieListItem) => ids.add(m.id));
      } catch (err) {
        errors.push(`list ${label} p${page}: ${(err as Error).message}`);
      }
    }
  }
  return Array.from(ids);
}

/** Gathers candidate trailer videos, falling back to another language. */
async function fetchTrailerVideos(
  tmdbId: number,
  language: string,
  fallbackLanguage: string,
): Promise<TmdbVideo[]> {
  const videos: TmdbVideo[] = [];
  try {
    const primary = await getMovieVideos(tmdbId, language);
    videos.push(...primary.results);
  } catch {
    // ignore; try fallback
  }
  // Always also pull fallback language so cross-language ranking can apply.
  if (fallbackLanguage && fallbackLanguage !== language) {
    try {
      const fallback = await getMovieVideos(tmdbId, fallbackLanguage);
      videos.push(...fallback.results);
    } catch {
      // ignore
    }
  }
  return videos;
}

async function syncOneMovie(
  supabase: SupabaseClient,
  tmdbId: number,
  opts: Required<SyncOptions>,
  result: SyncResult,
): Promise<void> {
  const details = await getMovieDetails(tmdbId, opts.language);

  // Upsert movie.
  const { data: movieRow, error: movieError } = await supabase
    .from("movies")
    .upsert(
      {
        tmdb_id: details.id,
        imdb_id: details.imdb_id,
        title: details.title || details.original_title,
        original_title: details.original_title,
        overview: details.overview || null,
        release_date: details.release_date || null,
        runtime: details.runtime,
        poster_path: details.poster_path,
        backdrop_path: details.backdrop_path,
        popularity: details.popularity,
        vote_average: details.vote_average,
        vote_count: details.vote_count,
        original_language: details.original_language,
        adult: details.adult,
        status: details.status,
        homepage: details.homepage,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tmdb_id" },
    )
    .select("id")
    .single();

  if (movieError || !movieRow) {
    throw new Error(movieError?.message ?? "movie upsert returned no row");
  }
  result.moviesUpserted++;
  const movieId = movieRow.id as number;

  // Ensure genres referenced by this movie exist, then link them.
  if (details.genres.length > 0) {
    await supabase
      .from("genres")
      .upsert(
        details.genres.map((g) => ({ id: g.id, name: g.name })),
        { onConflict: "id" },
      );
    await supabase.from("movie_genres").upsert(
      details.genres.map((g) => ({ movie_id: movieId, genre_id: g.id })),
      { onConflict: "movie_id,genre_id", ignoreDuplicates: true },
    );
  }

  // Trailer.
  const videos = await fetchTrailerVideos(
    tmdbId,
    opts.language,
    opts.fallbackLanguage,
  );
  const best = pickBestTrailer(videos);
  if (best) {
    const { error: trailerError } = await supabase.from("trailers").upsert(
      {
        movie_id: movieId,
        site: best.site,
        video_key: best.key,
        name: best.name,
        type: best.type,
        official: best.official,
        published_at: best.published_at || null,
        language: best.iso_639_1 || null,
        country: best.iso_3166_1 || null,
        is_active: true,
      },
      { onConflict: "site,video_key" },
    );
    if (trailerError) {
      throw new Error(`trailer upsert: ${trailerError.message}`);
    }
    result.trailersUpserted++;
  }
}

export async function syncTmdb(
  supabase: SupabaseClient,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const opts: Required<SyncOptions> = {
    pages: options.pages ?? 1,
    language: options.language ?? "ja-JP",
    region: options.region ?? "JP",
    fallbackLanguage: options.fallbackLanguage ?? "en-US",
  };

  const result: SyncResult = {
    genres: 0,
    moviesProcessed: 0,
    moviesUpserted: 0,
    trailersUpserted: 0,
    errors: [],
  };

  try {
    result.genres = await syncGenres(supabase, opts.language);
  } catch (err) {
    result.errors.push(`genres: ${(err as Error).message}`);
  }

  const ids = await collectMovieIds(
    opts.pages,
    opts.language,
    opts.region,
    result.errors,
  );

  for (const tmdbId of ids) {
    result.moviesProcessed++;
    try {
      await syncOneMovie(supabase, tmdbId, opts, result);
    } catch (err) {
      result.errors.push(`movie ${tmdbId}: ${(err as Error).message}`);
    }
  }

  return result;
}
