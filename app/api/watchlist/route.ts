import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  addWatchlistMovie,
  loadOrInitProfile,
  removeWatchlistMovie,
} from "@/lib/profile";
import { pickBestTrailerRow } from "@/lib/feed";
import { getImageUrl } from "@/lib/tmdb";
import type { FeedItem } from "@/types/trailer";
import type { TrailerRow } from "@/types/trailer";

export const dynamic = "force-dynamic";

interface WatchlistMovieRow {
  id: number;
  tmdb_id: number;
  title: string;
  overview: string | null;
  release_date: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  trailers: TrailerRow[];
  movie_genres: { genres: { id: number; name: string } | null }[];
}

/**
 * GET /api/watchlist?anonymousUserId=...
 * Returns the user's watchlisted movies (with a trailer when available).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const anonymousUserId = searchParams.get("anonymousUserId");

  if (!anonymousUserId) {
    return NextResponse.json(
      { error: "anonymousUserId is required" },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseServiceClient();
    const profile = await loadOrInitProfile(supabase, anonymousUserId);
    const ids = profile.watchlist_movie_ids;

    if (ids.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const { data, error } = await supabase
      .from("movies")
      .select(
        `id, tmdb_id, title, overview, release_date, poster_path, backdrop_path,
         trailers ( id, movie_id, site, video_key, name, type, official, published_at, language, country, is_active, created_at ),
         movie_genres ( genres ( id, name ) )`,
      )
      .in("id", ids);

    if (error) throw error;

    const rows = (data ?? []) as unknown as WatchlistMovieRow[];

    // Preserve the order in which movies were added to the watchlist.
    const orderMap = new Map(ids.map((id, idx) => [id, idx]));
    rows.sort(
      (a, b) =>
        (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
    );

    const items: FeedItem[] = rows.map((row) => {
      const best = pickBestTrailerRow(row.trailers ?? []);
      const genres = (row.movie_genres ?? [])
        .map((mg) => mg.genres?.name)
        .filter((n): n is string => Boolean(n));

      return {
        movie: {
          id: row.id,
          tmdbId: row.tmdb_id,
          title: row.title,
          overview: row.overview,
          releaseDate: row.release_date,
          posterUrl: getImageUrl(row.poster_path, "w500"),
          backdropUrl: getImageUrl(row.backdrop_path, "w1280"),
          genres,
        },
        trailer: best
          ? {
              id: best.id,
              site: "YouTube",
              videoKey: best.video_key,
              name: best.name,
              language: best.language,
            }
          : { id: -1, site: "YouTube", videoKey: "", name: null, language: null },
      };
    });

    return NextResponse.json({ items });
  } catch (err) {
    console.error("/api/watchlist GET failed", err);
    return NextResponse.json(
      { error: "Failed to load watchlist" },
      { status: 500 },
    );
  }
}

async function parseMutationBody(
  request: Request,
): Promise<{ anonymousUserId: string; movieId: number } | null> {
  try {
    const body = (await request.json()) as {
      anonymousUserId?: unknown;
      movieId?: unknown;
    };
    if (
      typeof body.anonymousUserId === "string" &&
      typeof body.movieId === "number"
    ) {
      return { anonymousUserId: body.anonymousUserId, movieId: body.movieId };
    }
  } catch {
    // fall through
  }
  return null;
}

/** POST /api/watchlist — add a movie. */
export async function POST(request: Request) {
  const parsed = await parseMutationBody(request);
  if (!parsed) {
    return NextResponse.json(
      { error: "anonymousUserId and movieId are required" },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseServiceClient();
    await addWatchlistMovie(supabase, parsed.anonymousUserId, parsed.movieId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("/api/watchlist POST failed", err);
    return NextResponse.json(
      { error: "Failed to add to watchlist" },
      { status: 500 },
    );
  }
}

/** DELETE /api/watchlist — remove a movie. */
export async function DELETE(request: Request) {
  const parsed = await parseMutationBody(request);
  if (!parsed) {
    return NextResponse.json(
      { error: "anonymousUserId and movieId are required" },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseServiceClient();
    await removeWatchlistMovie(
      supabase,
      parsed.anonymousUserId,
      parsed.movieId,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("/api/watchlist DELETE failed", err);
    return NextResponse.json(
      { error: "Failed to remove from watchlist" },
      { status: 500 },
    );
  }
}
