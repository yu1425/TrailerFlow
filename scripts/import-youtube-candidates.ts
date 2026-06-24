/**
 * Fetch latest videos from official YouTube channels and import trailer
 * candidates into Supabase.
 *
 * Usage:
 *   export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/import-youtube-candidates.ts
 *
 * Requires: YOUTUBE_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Workflow:
 *  1. Reads active rows from `official_channels`.
 *  2. For each channel, fetches the latest uploads via YouTube Data API v3.
 *  3. Filters by trailer-like title keywords.
 *  4. Inserts into `contents` / `content_trailers` with curation_status = 'candidate'.
 *  5. Candidates do NOT appear in the public feed until manually approved.
 */

import { createClient } from "@supabase/supabase-js";

// Title keywords that identify a video as a probable trailer.
const TRAILER_KEYWORDS = [
  "予告",
  "本予告",
  "特報",
  "ティザー",
  "trailer",
  "official trailer",
  "teaser",
  "pv",
  "プロモーション映像",
];

interface YouTubeSearchItem {
  id: { kind: string; videoId?: string };
  snippet: {
    title: string;
    description: string;
    channelId: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails: {
      high?: { url: string };
      default?: { url: string };
    };
  };
}

interface YouTubeSearchResponse {
  items: YouTubeSearchItem[];
  nextPageToken?: string;
}

async function fetchChannelVideos(
  channelId: string,
  apiKey: string,
  maxResults = 25,
): Promise<YouTubeSearchItem[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("channelId", channelId);
  url.searchParams.set("type", "video");
  url.searchParams.set("order", "date");
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YouTube API error: ${res.status} ${body}`);
  }

  const data = (await res.json()) as YouTubeSearchResponse;
  return data.items ?? [];
}

function isTrailerTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return TRAILER_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

function getYouTubeThumbnail(key: string): string {
  return `https://img.youtube.com/vi/${key}/hqdefault.jpg`;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  if (!apiKey) {
    console.error("Missing YOUTUBE_API_KEY.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Load official channels.
  const { data: channels, error: chErr } = await supabase
    .from("official_channels")
    .select("*")
    .eq("is_active", true);

  if (chErr) {
    console.error("Failed to load official_channels:", chErr.message);
    process.exit(1);
  }
  if (!channels || channels.length === 0) {
    console.log("No active official_channels found. Insert rows first.");
    return;
  }

  console.log(`Found ${channels.length} official channel(s).\n`);
  let totalCandidates = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const channel of channels) {
    console.log(`Channel: ${channel.channel_title} (${channel.id})`);

    let videos: YouTubeSearchItem[];
    try {
      videos = await fetchChannelVideos(channel.id, apiKey);
    } catch (err) {
      console.error(`  Failed to fetch: ${(err as Error).message}`);
      totalErrors++;
      continue;
    }

    const trailers = videos.filter(
      (v) =>
        v.id.videoId &&
        isTrailerTitle(v.snippet.title),
    );
    console.log(
      `  ${videos.length} video(s), ${trailers.length} trailer candidate(s)`,
    );

    for (const video of trailers) {
      const videoId = video.id.videoId!;
      const snippet = video.snippet;

      // Skip if this video_key already exists.
      const { data: existing } = await supabase
        .from("content_trailers")
        .select("id")
        .eq("youtube_video_key", videoId)
        .maybeSingle();

      if (existing) {
        totalSkipped++;
        continue;
      }

      try {
        const thumbUrl = getYouTubeThumbnail(videoId);

        // Derive a title: strip common trailer suffixes to get the content title.
        const cleanTitle = snippet.title
          .replace(/[\s\-|]+?(予告|本予告|特報|ティザー|Trailer|Official Trailer|Teaser|PV|プロモーション映像).*/i, "")
          .trim() || snippet.title;

        // Create content.
        const { data: content, error: cErr } = await supabase
          .from("contents")
          .insert({
            content_type: channel.content_type || "movie",
            title: cleanTitle,
            overview: snippet.description?.slice(0, 1000) || null,
            language: channel.language || "ja",
            country: "JP",
            thumbnail_url: thumbUrl,
            source: "youtube",
            curation_status: "candidate",
          })
          .select("id")
          .single();

        if (cErr || !content) throw cErr ?? new Error("No content id returned");
        const contentId = content.id as number;

        // Create content_trailer.
        await supabase.from("content_trailers").insert({
          content_id: contentId,
          youtube_video_key: videoId,
          title: snippet.title,
          channel_title: snippet.channelTitle,
          channel_id: snippet.channelId,
          language: channel.language || "ja",
          type: "Trailer",
          official: true,
          published_at: snippet.publishedAt,
          thumbnail_url: thumbUrl,
          is_active: true,
        });

        totalCandidates++;
        console.log(`    ✓ ${cleanTitle} (${videoId})`);
      } catch (err) {
        totalErrors++;
        console.error(`    ✗ ${snippet.title}: ${(err as Error).message}`);
      }
    }
  }

  console.log(
    `\nDone. Candidates: ${totalCandidates}, Skipped (existing): ${totalSkipped}, Errors: ${totalErrors}`,
  );
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
