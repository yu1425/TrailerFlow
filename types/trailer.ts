import type { FeedMovie } from "./movie";

/** Mirrors the `trailers` table. */
export interface TrailerRow {
  id: number;
  movie_id: number;
  site: string;
  video_key: string;
  name: string | null;
  type: string | null;
  official: boolean | null;
  published_at: string | null;
  language: string | null;
  country: string | null;
  is_active: boolean | null;
  created_at: string;
}

/** Client-facing trailer shape returned by /api/feed. */
export interface FeedTrailer {
  id: number;
  site: "YouTube";
  videoKey: string;
  name: string | null;
  /** ISO 639-1 language of the trailer audio/title, e.g. "ja", "en". */
  language: string | null;
}

/** One playable unit in the feed: a movie/content paired with its best trailer. */
export interface FeedItem {
  movie: FeedMovie;
  trailer: FeedTrailer;
  /** "content" if from curated contents table, "tmdb" if from movies table. */
  source?: "content" | "tmdb";
}

export interface FeedResponse {
  items: FeedItem[];
}
