/**
 * Movie shapes used across the app.
 *
 * `MovieRow` mirrors the `movies` table (snake_case from Supabase).
 * `FeedMovie` is the camelCase, client-facing shape returned by /api/feed.
 */

export interface MovieRow {
  id: number;
  tmdb_id: number;
  imdb_id: string | null;
  title: string;
  original_title: string | null;
  overview: string | null;
  release_date: string | null;
  runtime: number | null;
  poster_path: string | null;
  backdrop_path: string | null;
  popularity: number | null;
  vote_average: number | null;
  vote_count: number | null;
  original_language: string | null;
  adult: boolean | null;
  status: string | null;
  homepage: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeedMovie {
  id: number;
  tmdbId: number;
  title: string;
  overview: string | null;
  releaseDate: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  genres: string[];
  /** One-line marketing copy shown prominently under the title (curated). */
  shortCopy?: string | null;
  /** Curated content type, e.g. "movie" | "anime" | "game". */
  contentType?: string | null;
  /** Official site URL, if known. */
  officialUrl?: string | null;
  /** Content language (ISO 639-1), e.g. "ja". */
  language?: string | null;
}

export interface Genre {
  id: number;
  name: string;
}
