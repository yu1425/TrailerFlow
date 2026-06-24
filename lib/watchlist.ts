import type { FeedItem } from "@/types/trailer";

/** Client-side helpers for the watchlist API. */

export async function fetchWatchlist(
  anonymousUserId: string,
): Promise<FeedItem[]> {
  const res = await fetch(
    `/api/watchlist?anonymousUserId=${encodeURIComponent(anonymousUserId)}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Failed to load watchlist: ${res.status}`);
  const data = (await res.json()) as { items: FeedItem[] };
  return data.items;
}

export async function addToWatchlist(
  anonymousUserId: string,
  movieId: number,
): Promise<void> {
  const res = await fetch("/api/watchlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anonymousUserId, movieId }),
  });
  if (!res.ok) throw new Error(`Failed to add to watchlist: ${res.status}`);
}

export async function removeFromWatchlist(
  anonymousUserId: string,
  movieId: number,
): Promise<void> {
  const res = await fetch("/api/watchlist", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anonymousUserId, movieId }),
  });
  if (!res.ok) throw new Error(`Failed to remove from watchlist: ${res.status}`);
}
