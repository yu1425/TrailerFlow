import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { buildFeed } from "@/lib/feed";
import { buildContentFeed } from "@/lib/contentFeed";
import { getDataMode } from "@/lib/dataMode";
import type { FeedItem, FeedResponse } from "@/types/trailer";

export const dynamic = "force-dynamic";

/**
 * GET /api/feed
 *
 * Respects DATA_MODE:
 *   "manual" → curated contents only
 *   "tmdb"   → TMDb movies only (original behaviour)
 *   "mixed"  → curated first, TMDb fallback
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const anonymousUserId = searchParams.get("anonymousUserId");
  const channel = searchParams.get("channel");
  const limitParam = searchParams.get("limit");
  const preferredLanguage = searchParams.get("preferredLanguage");
  const excludeParam = searchParams.get("recentlyWatchedMovieIds");

  if (!anonymousUserId) {
    return NextResponse.json(
      { error: "anonymousUserId is required" },
      { status: 400 },
    );
  }

  let limit = limitParam ? Number.parseInt(limitParam, 10) : 10;
  if (!Number.isFinite(limit) || limit <= 0) limit = 10;
  limit = Math.min(limit, 30);

  const excludeMovieIds = (excludeParam ?? "")
    .split(",")
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isFinite(n))
    .slice(0, 300);

  try {
    const supabase = getSupabaseServiceClient();
    const mode = getDataMode();
    let items: FeedItem[] = [];

    let strictMatchCount = 0;
    let totalCandidates = 0;

    if (mode === "manual" || mode === "mixed") {
      const result = await buildContentFeed(supabase, {
        anonymousUserId,
        channel,
        limit,
        preferredLanguage,
        excludeContentIds: excludeMovieIds,
      });
      items = result.items;
      strictMatchCount = result.strictMatchCount;
      totalCandidates = result.totalCandidates;
    }

    // TMDb fallback (or sole source if mode === "tmdb").
    if (items.length < limit && mode !== "manual") {
      // Mark content ids as seen so TMDb fill doesn't duplicate.
      const contentIds = new Set(items.map((it) => it.movie.id));
      const tmdbItems = await buildFeed(supabase, {
        anonymousUserId,
        channel,
        limit: limit - items.length,
        preferredLanguage,
        excludeMovieIds: [...excludeMovieIds, ...contentIds],
      });
      // Tag TMDb items for debugging.
      for (const it of tmdbItems) it.source = "tmdb";
      items = [...items, ...tmdbItems];
    }

    const body: FeedResponse & { _debug?: object } = { items };
    if (searchParams.get("debug") === "1") {
      body._debug = { strictMatchCount, totalCandidates };
    }
    return NextResponse.json(body);
  } catch (err) {
    console.error("/api/feed failed", err);
    return NextResponse.json(
      { error: "Failed to build feed" },
      { status: 500 },
    );
  }
}
