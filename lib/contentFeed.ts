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
  /** True when the item came from the strict (channel-filtered) pass. */
  strictMatch: boolean;
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
  const OPENER_JITTER = 6;

  const strictEntries = entries.filter((e) => e.strictMatch);
  const fillerEntries = entries.filter((e) => !e.strictMatch);

  const openerScore = new Map<RankedEntry, number>();
  for (const e of entries) {
    openerScore.set(e, e.quality + Math.random() * OPENER_JITTER);
  }

  const out: RankedEntry[] = [];

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

  const pickFrom = (remaining: RankedEntry[]): number | undefined => {
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
      pick = order.find((i) => !wouldTripleType(remaining[i]));
    }
    if (pick === undefined) pick = order[0];
    return pick;
  };

  // Phase 1: place all strict-match items first, with diversity rules.
  const remainingStrict = [...strictEntries];
  while (out.length < limit && remainingStrict.length > 0) {
    const pick = pickFrom(remainingStrict);
    if (pick === undefined) break;
    out.push(remainingStrict[pick]);
    remainingStrict.splice(pick, 1);
  }

  // Phase 2: fill remaining slots with filler items.
  const remainingFiller = [...fillerEntries];
  while (out.length < limit && remainingFiller.length > 0) {
    const pick = pickFrom(remainingFiller);
    if (pick === undefined) break;
    out.push(remainingFiller[pick]);
    remainingFiller.splice(pick, 1);
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
    // Year filter (e.g. "新作予告" channel).
    if (channelConfig.recentYears) {
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - channelConfig.recentYears);
      query = query.gte("release_date", cutoff.toISOString().slice(0, 10));
    }

    // content_type filter (e.g. "アニメ" → anime, "ゲーム" → game).
    if (channelConfig.contentTypes && channelConfig.contentTypes.length > 0) {
      query = query.in("content_type", channelConfig.contentTypes);
    }

    // country filter (e.g. "日本映画" → JP).
    if (channelConfig.contentCountries && channelConfig.contentCountries.length > 0) {
      query = query.in("country", channelConfig.contentCountries);
    }

    // Tag-based filter: find content ids that have ANY of the specified tags,
    // then restrict the main query to those ids. This replaces the old
    // genre-id-based filter that never matched curated content.
    const hasTagFilter =
      channelConfig.contentTags && channelConfig.contentTags.length > 0;
    // For "japanese" channel: also accept language-level match as an OR path,
    // since some JP content may lack the explicit "邦画" tag.
    const hasLanguageFilter = !!channelConfig.language;

    if (hasTagFilter || hasLanguageFilter) {
      const candidateIds = new Set<number>();

      if (hasTagFilter) {
        const { data: tagMatches } = await supabase
          .from("content_tags")
          .select("content_id")
          .in("tag", channelConfig.contentTags!)
          .limit(1000);
        for (const r of tagMatches ?? []) candidateIds.add(r.content_id as number);
      }

      if (hasLanguageFilter) {
        const { data: langMatches } = await supabase
          .from("contents")
          .select("id")
          .eq("language", channelConfig.language!)
          .eq("curation_status", "approved")
          .eq("is_active", true)
          .limit(1000);
        for (const r of langMatches ?? []) candidateIds.add(r.id as number);
      }

      if (candidateIds.size === 0) return [];
      query = query.in("id", Array.from(candidateIds));
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

  const rankAndCollect = (pool: ContentWithRelations[], strict: boolean) => {
    const scored = pool
      .map((c) => ({ c, score: scoreContent(c, config, excludeSet) }))
      .sort((a, b) => b.score - a.score);
    for (const { c } of scored) {
      if (seen.has(c.id)) continue;
      const item = contentToFeedItem(c, langPriority);
      if (!item) continue;
      seen.add(c.id);
      ranked.push({ c, item, quality: c.quality_score ?? 50, strictMatch: strict });
    }
  };

  // Pass 1: strict channel filters + recently-watched exclusion.
  let pool = await fetchContentPool(supabase, config, false, excludeIds);
  if (config.sort === "random") pool = shuffle(pool);
  rankAndCollect(pool, true);

  // Pass 2: relax channel filters if the strict pass is thin.
  if (ranked.length < limit) {
    for (const id of excludeIds) seen.add(id);
    const relaxedPool = await fetchContentPool(supabase, config, true);
    rankAndCollect(shuffle(relaxedPool), false);
  }

  // Pass 3: last resort — allow recently-watched content back in rather than
  // returning an empty queue, so continuous playback never dead-ends. This is
  // what keeps a small approved pool (e.g. ~20 trailers) looping smoothly.
  if (ranked.length === 0) {
    seen.clear();
    const relaxedPool = await fetchContentPool(supabase, config, true);
    rankAndCollect(shuffle(relaxedPool), false);
  }

  return arrangeForDiversity(ranked, limit);
}
