/**
 * Recently-watched movie ids, persisted in localStorage so the feed can avoid
 * showing the same trailer again across sessions. Capped to MAX_RECENT.
 */

const STORAGE_KEY = "trailerflow.recentlyWatched";
const MAX_RECENT = 200;

export function getRecentlyWatched(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is number => typeof n === "number");
  } catch {
    return [];
  }
}

/**
 * Records a movie id as recently watched. Most-recent-first, de-duplicated,
 * trimmed to MAX_RECENT. Returns the updated list.
 */
export function pushRecentlyWatched(movieId: number): number[] {
  const current = getRecentlyWatched().filter((id) => id !== movieId);
  const next = [movieId, ...current].slice(0, MAX_RECENT);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private-mode errors
  }
  return next;
}
