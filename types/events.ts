/** All user interaction event types tracked by the feed. */
export type EventType =
  | "play_start"
  | "play_end"
  | "skip"
  | "like"
  | "dislike"
  | "watchlist_add"
  | "watchlist_remove"
  | "details_open"
  | "channel_change";

/** Request body for POST /api/events. */
export interface UserEventInput {
  anonymousUserId: string;
  movieId: number;
  trailerId: number;
  eventType: EventType;
  channel: string | null;
  watchSeconds: number | null;
  videoDuration: number | null;
}

/** Mirrors the `user_events` table. */
export interface UserEventRow {
  id: number;
  anonymous_user_id: string;
  movie_id: number | null;
  trailer_id: number | null;
  event_type: EventType;
  channel: string | null;
  watch_seconds: number | null;
  video_duration: number | null;
  created_at: string;
}

/** Mirrors the `anonymous_profiles` table. */
export interface AnonymousProfileRow {
  anonymous_user_id: string;
  genre_weights: Record<string, number>;
  preferred_languages: string[];
  watched_movie_ids: number[];
  liked_movie_ids: number[];
  skipped_movie_ids: number[];
  watchlist_movie_ids: number[];
  created_at: string;
  updated_at: string;
}
