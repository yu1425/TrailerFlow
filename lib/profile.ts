import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnonymousProfileRow, EventType } from "@/types/events";

/**
 * Server-side mutations of anonymous_profiles. Shared by /api/events and
 * /api/watchlist so the personalisation state has a single owner.
 */

const EMPTY_PROFILE = (id: string): AnonymousProfileRow => ({
  anonymous_user_id: id,
  genre_weights: {},
  preferred_languages: [],
  watched_movie_ids: [],
  liked_movie_ids: [],
  skipped_movie_ids: [],
  watchlist_movie_ids: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

/** Loads the profile, returning an in-memory empty one if it doesn't exist. */
export async function loadOrInitProfile(
  supabase: SupabaseClient,
  anonymousUserId: string,
): Promise<AnonymousProfileRow> {
  const { data } = await supabase
    .from("anonymous_profiles")
    .select("*")
    .eq("anonymous_user_id", anonymousUserId)
    .maybeSingle();

  return (data as AnonymousProfileRow | null) ?? EMPTY_PROFILE(anonymousUserId);
}

function addUnique(list: number[], id: number): number[] {
  return list.includes(id) ? list : [...list, id];
}

function removeId(list: number[], id: number): number[] {
  return list.filter((x) => x !== id);
}

const LIKE_WEIGHT_STEP = 1;
const DISLIKE_WEIGHT_STEP = 1;

async function getMovieGenreIds(
  supabase: SupabaseClient,
  movieId: number,
): Promise<number[]> {
  const { data } = await supabase
    .from("movie_genres")
    .select("genre_id")
    .eq("movie_id", movieId);
  return (data ?? []).map((r) => r.genre_id as number);
}

function adjustGenreWeights(
  weights: Record<string, number>,
  genreIds: number[],
  delta: number,
): Record<string, number> {
  const next = { ...weights };
  for (const gid of genreIds) {
    const key = String(gid);
    next[key] = (next[key] ?? 0) + delta;
  }
  return next;
}

/**
 * Applies an event's side effects to the profile and persists it.
 * No-ops for event types that don't change profile state.
 */
export async function applyEventToProfile(
  supabase: SupabaseClient,
  anonymousUserId: string,
  eventType: EventType,
  movieId: number,
): Promise<void> {
  const profile = await loadOrInitProfile(supabase, anonymousUserId);

  let {
    watched_movie_ids,
    liked_movie_ids,
    skipped_movie_ids,
    watchlist_movie_ids,
    genre_weights,
  } = profile;

  switch (eventType) {
    case "play_end":
      watched_movie_ids = addUnique(watched_movie_ids, movieId);
      break;
    case "skip":
      skipped_movie_ids = addUnique(skipped_movie_ids, movieId);
      break;
    case "like": {
      liked_movie_ids = addUnique(liked_movie_ids, movieId);
      const genres = await getMovieGenreIds(supabase, movieId);
      genre_weights = adjustGenreWeights(genre_weights, genres, LIKE_WEIGHT_STEP);
      break;
    }
    case "dislike": {
      const genres = await getMovieGenreIds(supabase, movieId);
      genre_weights = adjustGenreWeights(
        genre_weights,
        genres,
        -DISLIKE_WEIGHT_STEP,
      );
      break;
    }
    case "watchlist_add":
      watchlist_movie_ids = addUnique(watchlist_movie_ids, movieId);
      break;
    case "watchlist_remove":
      watchlist_movie_ids = removeId(watchlist_movie_ids, movieId);
      break;
    default:
      // play_start, details_open, channel_change: no profile change.
      return;
  }

  await supabase.from("anonymous_profiles").upsert(
    {
      anonymous_user_id: anonymousUserId,
      watched_movie_ids,
      liked_movie_ids,
      skipped_movie_ids,
      watchlist_movie_ids,
      genre_weights,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "anonymous_user_id" },
  );
}

/** Directly add a movie to the watchlist (used by POST /api/watchlist). */
export async function addWatchlistMovie(
  supabase: SupabaseClient,
  anonymousUserId: string,
  movieId: number,
): Promise<void> {
  const profile = await loadOrInitProfile(supabase, anonymousUserId);
  await supabase.from("anonymous_profiles").upsert(
    {
      anonymous_user_id: anonymousUserId,
      watchlist_movie_ids: addUnique(profile.watchlist_movie_ids, movieId),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "anonymous_user_id" },
  );
}

/** Directly remove a movie from the watchlist (used by DELETE /api/watchlist). */
export async function removeWatchlistMovie(
  supabase: SupabaseClient,
  anonymousUserId: string,
  movieId: number,
): Promise<void> {
  const profile = await loadOrInitProfile(supabase, anonymousUserId);
  await supabase.from("anonymous_profiles").upsert(
    {
      anonymous_user_id: anonymousUserId,
      watchlist_movie_ids: removeId(profile.watchlist_movie_ids, movieId),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "anonymous_user_id" },
  );
}
