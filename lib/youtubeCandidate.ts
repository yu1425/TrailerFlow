import type { ContentType } from "@/types/content";

export const YOUTUBE_VIDEO_KEY_RE = /^[A-Za-z0-9_-]{11}$/;

export type DurationBucket = "short" | "ideal" | "long" | "very_long";

export interface YouTubeVideoMetadata {
  title: string | null;
  description: string | null;
  channelTitle: string | null;
  channelId: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
}

interface YouTubeVideosResponse {
  items?: Array<{
    snippet?: {
      title?: string;
      description?: string;
      channelTitle?: string;
      channelId?: string;
      publishedAt?: string;
    };
    contentDetails?: {
      duration?: string;
    };
  }>;
}

interface YouTubeOEmbedResponse {
  title?: string;
  author_name?: string;
}

export function extractYouTubeVideoKey(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (YOUTUBE_VIDEO_KEY_RE.test(raw)) return raw;

  const withProtocol = raw.startsWith("http") ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtube.com" || host === "m.youtube.com") {
      const watchKey = url.searchParams.get("v");
      if (watchKey && YOUTUBE_VIDEO_KEY_RE.test(watchKey)) return watchKey;

      const [kind, key] = url.pathname.split("/").filter(Boolean);
      if (
        (kind === "embed" || kind === "shorts") &&
        key &&
        YOUTUBE_VIDEO_KEY_RE.test(key)
      ) {
        return key;
      }
    }

    if (host === "youtu.be") {
      const key = url.pathname.split("/").filter(Boolean)[0];
      if (key && YOUTUBE_VIDEO_KEY_RE.test(key)) return key;
    }
  } catch {
    return null;
  }

  return null;
}

export function getYouTubeWatchUrl(videoKey: string): string {
  return `https://www.youtube.com/watch?v=${videoKey}`;
}

export function getYouTubeThumbnail(videoKey: string): string {
  return `https://img.youtube.com/vi/${videoKey}/hqdefault.jpg`;
}

export function parseYouTubeDuration(duration: string): number | null {
  const match = duration.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
  );
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match;
  return (
    (Number(days ?? 0) || 0) * 86400 +
    (Number(hours ?? 0) || 0) * 3600 +
    (Number(minutes ?? 0) || 0) * 60 +
    (Number(seconds ?? 0) || 0)
  );
}

export function getDurationBucket(seconds: number | null): DurationBucket | null {
  if (seconds == null) return null;
  if (seconds < 45) return "short";
  if (seconds < 210) return "ideal";
  if (seconds < 270) return "long";
  return "very_long";
}

export function buildCandidateTags(
  contentType: ContentType,
  trailerType: string,
): string[] {
  const tags = new Set<string>();
  const normalizedTrailerType = trailerType.trim();
  if (normalizedTrailerType) tags.add(normalizedTrailerType);
  if (contentType) tags.add(contentType);
  if (tags.size === 0) tags.add("未分類");
  return Array.from(tags);
}

async function fetchYouTubeDataApiMetadata(
  videoKey: string,
): Promise<YouTubeVideoMetadata | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("id", videoKey);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as YouTubeVideosResponse;
  const item = data.items?.[0];
  if (!item) return null;

  return {
    title: item.snippet?.title ?? null,
    description: item.snippet?.description ?? null,
    channelTitle: item.snippet?.channelTitle ?? null,
    channelId: item.snippet?.channelId ?? null,
    publishedAt: item.snippet?.publishedAt ?? null,
    durationSeconds: item.contentDetails?.duration
      ? parseYouTubeDuration(item.contentDetails.duration)
      : null,
  };
}

async function fetchOEmbedMetadata(
  videoKey: string,
): Promise<YouTubeVideoMetadata | null> {
  const url = new URL("https://www.youtube.com/oembed");
  url.searchParams.set("url", getYouTubeWatchUrl(videoKey));
  url.searchParams.set("format", "json");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as YouTubeOEmbedResponse;

  return {
    title: data.title ?? null,
    description: null,
    channelTitle: data.author_name ?? null,
    channelId: null,
    publishedAt: null,
    durationSeconds: null,
  };
}

export async function fetchYouTubeVideoMetadata(
  videoKey: string,
): Promise<YouTubeVideoMetadata> {
  const fromApi = await fetchYouTubeDataApiMetadata(videoKey).catch(() => null);
  if (fromApi) return fromApi;

  const fromOEmbed = await fetchOEmbedMetadata(videoKey).catch(() => null);
  if (fromOEmbed) return fromOEmbed;

  return {
    title: null,
    description: null,
    channelTitle: null,
    channelId: null,
    publishedAt: null,
    durationSeconds: null,
  };
}
