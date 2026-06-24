import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedItem } from "@/types/trailer";
import type { ContentTrailerRow, ContentWithRelations } from "@/types/content";
import type { ChannelConfig } from "@/lib/feed";
import { getChannel, buildLanguagePriority } from "@/lib/feed";

/**
 * Content-based feed builder. Queries approved contents + content_trailers
 * instead of the TMDb-derived movies/trailers tables.
 */

const CONTENT_SELECT = `
  id, content_type, title, original_title, overview, short_copy,
  release_date, language, country, official_url,
  thumbnail_url, poster_url, backdrop_url,
  quality_score, source, curation_status, is_active,
  created_at, updated_at,
  content_trailers!inner (
    id, content_id, youtube_video_key, title, channel_title, channel_id,
    language, type, official, published_at, thumbnail_url, is_active, created_at
  ),
  content_tags ( tag )
`;

const POOL_SIZE = 160;

interface BuildContentFeedOptions {
  anonymousUserId: string;
  channel?: string | null;
  limit?: number;
  preferredLanguage?: string | null;
  excludeContentIds?: number[];
}

function pickBestContentTrailer(
  trailers: ContentTrailerRow[],
  langPriority: string[],
): ContentTrailerRow | null {
  const active = trailers.filter(
    (t) => t.is_active && t.youtube_video_key,
  );
  if (active.length === 0) return null;

  return [...active].sort((a, b) => {
    const aO = a.official ? 0 : 1;
    const bO = b.official ? 0 : 1;
    if (aO !== bO) return aO - bO;

    const langRank = (lang: string | null) => {
      if (!lang) return langPriority.length;
      const idx = langPriority.indexOf(lang);
      if (idx !== -1) return idx;
      const base = langPriority.findIndex((p) => lang.startsWith(p));
      return base !== -1 ? base : langPriority.length;
    };
    const langDiff = langRank(a.language) - langRank(b.language);
    if (langDiff !== 0) return langDiff;

    const aTime = a.published_at ? Date.parse(a.published_at) : 0;
    const bTime = b.published_at ? Date.parse(b.published_at) : 0;
    return bTime - aTime;
  })[0];
}

function contentToFeedItem(
  c: ContentWithRelations,
  langPriority: string[],
): FeedItem | null {
  const best = pickBestContentTrailer(c.content_trailers, langPriority);
  if (!best) return null;

  const tags = c.content_tags.map((t) => t.tag);

  return {
    movie: {
      id: c.id,
      tmdbId: 0,
      title: c.title,
      overview: c.overview || c.short_copy,
      releaseDate: c.release_date,
      posterUrl: c.poster_url || c.thumbnail_url,
      backdropUrl: c.backdrop_url || c.thumbnail_url,
      genres: tags,
      shortCopy: c.short_copy,
      contentType: c.content_type,
      officialUrl: c.official_url,
      language: c.language,
    },
    trailer: {
      id: best.id,
      site: "YouTube",
      videoKey: best.youtube_video_key,
      name: best.title,
      language: best.language,
    },
    source: "content",
  };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function scoreContent(
  c: ContentWithRelations,
  config: ChannelConfig,
  excludeSet: Set<number>,
): number {
  if (config.sort === "random") return Math.random();

  const qs = c.quality_score ?? 50;
  // Quality dominates (0–10), with a smaller random term so the ordering still
  // shuffles between sessions but high-quality trailers reliably surface first.
  const qScore = qs / 10; // 0–10 range
  const randomness = Math.random() * 3;
  let score = qScore + randomness;

  if (config.sort === "popularity") score += qScore * 0.5;
  if (excludeSet.has(c.id)) score -= 1000;

  return score;
}

interface RankedEntry {
  c: ContentWithRelations;
  item: FeedItem;
  quality: number;
}

/**
 * Re-orders a score-sorted candidate list into the final feed, applying:
 *  - first `OPENERS` slots biased toward the highest quality_score,
 *  - no 3 consecutive items of the same content_type,
 *  - avoid the same primary tag appearing back-to-back.
 * Falls back gracefully (relax tag, then type) so small pools never stall.
 */
function arrangeForDiversity(entries: RankedEntry[], limit: number): FeedItem[] {
  const OPENERS = 3;
  // Jitter range for the opening slots. Small enough that only genuinely
  // high-quality trailers can lead (a q74 + 6 still loses to a q84), but large
  // enough that the top band reshuffles — so a first-time visitor doesn't see
  // the exact same three openers every single visit.
  const OPENER_JITTER = 6;
  const remaining = [...entries];
  const out: RankedEntry[] = [];

  // Stable per-entry opener score (quality + one-time jitter), so the opener
  // ordering is consistent within a single build but varies across builds.
  const openerScore = new Map<RankedEntry, number>();
  for (const e of entries) {
    openerScore.set(e, e.quality + Math.random() * OPENER_JITTER);
  }

  const primaryTag = (e: RankedEntry): string | null =>
    e.c.content_tags[0]?.tag ?? null;

  const wouldTripleType = (e: RankedEntry): boolean => {
    const n = out.length;
    if (n < 2) return false;
    const t = e.c.content_type;
    return out[n - 1].c.content_type === t && out[n - 2].c.content_type === t;
  };

  const repeatsTag = (e: RankedEntry): boolean => {
    const prev = out[out.length - 1];
    if (!prev) return false;
    const tag = primaryTag(e);
    if (!tag) return false;
    return prev.c.content_tags.some((t) => t.tag === tag);
  };

  while (out.length < limit && remaining.length > 0) {
    // For the opening slots, prefer high-quality candidates (with a touch of
    // jitter so the strong openers rotate between visits).
    const order =
      out.length < OPENERS
        ? remaining
            .map((_, i) => i)
            .sort(
              (a, b) =>
                (openerScore.get(remaining[b]) ?? remaining[b].quality) -
                (openerScore.get(remaining[a]) ?? remaining[a].quality),
            )
        : remaining.map((_, i) => i);

    let pick = order.find(
      (i) => !wouldTripleType(remaining[i]) && !repeatsTag(remaining[i]),
    );
    if (pick === undefined) {
      // Relax the tag rule first, keep the content_type spacing.
      pick = order.find((i) => !wouldTripleType(remaining[i]));
    }
    if (pick === undefined) pick = order[0];

    out.push(remaining[pick]);
    remaining.splice(pick, 1);
  }

  return out.map((e) => e.item);
}

async function fetchContentPool(
  supabase: SupabaseClient,
  channelConfig: ChannelConfig,
  relaxed: boolean,
  excludeIds: number[] = [],
): Promise<ContentWithRelations[]> {
  let query = supabase
    .from("contents")
    .select(CONTENT_SELECT)
    .eq("curation_status", "approved")
    .eq("is_active", true)
    .eq("content_trailers.is_active", true);

  if (!relaxed && excludeIds.length > 0) {
    query = query.not("id", "in", `(${excludeIds.join(",")})`);
  }

  if (!relaxed) {
    if (channelConfig.language) {
      query = query.eq("language", channelConfig.language);
    }
    if (channelConfig.recentYears) {
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - channelConfig.recentYears);
      query = query.gte("release_date", cutoff.toISOString().slice(0, 10));
    }
    if (channelConfig.genres && channelConfig.genres.length > 0) {
      // For curated content, match via content_tags (genre names as tags)
      const { data: tagMatches } = await supabase
        .from("content_tags")
        .select("content_id")
        .in("tag", channelConfig.genres.map(String))
        .limit(1000);
      const ids = Array.from(new Set((tagMatches ?? []).map((r) => r.content_id)));
      if (ids.length === 0) return [];
      query = query.in("id", ids);
    }
  }

  if (channelConfig.sort === "release") {
    query = query.order("release_date", { ascending: false, nullsFirst: false });
  } else {
    query = query.order("quality_score", { ascending: false, nullsFirst: false });
  }

  const { data, error } = await query.limit(POOL_SIZE);
  if (error) throw error;
  return (data ?? []) as unknown as ContentWithRelations[];
}

export async function buildContentFeed(
  supabase: SupabaseClient,
  options: BuildContentFeedOptions,
): Promise<FeedItem[]> {
  const { limit = 10 } = options;
  const channel = getChannel(options.channel);
  const config = channel.config;
  const langPriority = buildLanguagePriority(options.preferredLanguage);
  const excludeIds = options.excludeContentIds ?? [];
  const excludeSet = new Set(excludeIds);

  const seen = new Set<number>();
  const ranked: RankedEntry[] = [];

  const rankAndCollect = (pool: ContentWithRelations[]) => {
    const scored = pool
      .map((c) => ({ c, score: scoreContent(c, config, excludeSet) }))
      .sort((a, b) => b.score - a.score);
    for (const { c } of scored) {
      if (seen.has(c.id)) continue;
      const item = contentToFeedItem(c, langPriority);
      if (!item) continue;
      seen.add(c.id);
      ranked.push({ c, item, quality: c.quality_score ?? 50 });
    }
  };

  // Pass 1: strict channel filters + recently-watched exclusion.
  let pool = await fetchContentPool(supabase, config, false, excludeIds);
  if (config.sort === "random") pool = shuffle(pool);
  rankAndCollect(pool);

  // Pass 2: relax channel filters if the strict pass is thin.
  if (ranked.length < limit) {
    for (const id of excludeIds) seen.add(id);
    const relaxedPool = await fetchContentPool(supabase, config, true);
    rankAndCollect(shuffle(relaxedPool));
  }

  // Pass 3: last resort — allow recently-watched content back in rather than
  // returning an empty queue, so continuous playback never dead-ends. This is
  // what keeps a small approved pool (e.g. ~20 trailers) looping smoothly.
  if (ranked.length === 0) {
    seen.clear();
    const relaxedPool = await fetchContentPool(supabase, config, true);
    rankAndCollect(shuffle(relaxedPool));
  }

  return arrangeForDiversity(ranked, limit);
}
