import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  buildCandidateTags,
  extractYouTubeVideoKey,
  fetchYouTubeVideoMetadata,
  getDurationBucket,
  getYouTubeThumbnail,
  getYouTubeWatchUrl,
} from "@/lib/youtubeCandidate";
import type { ContentType } from "@/types/content";

export const dynamic = "force-dynamic";

const VALID_CONTENT_TYPES: ContentType[] = [
  "movie",
  "anime",
  "game",
  "tv",
  "travel",
  "restaurant",
];

interface YouTubeCandidateBody {
  youtube_url_or_key?: string;
  title?: string;
  content_type?: ContentType;
  trailer_type?: string;
  source_url?: string;
  curator_note?: string;
}

function verifyAdmin(request: Request): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function adminUrlFor(status: string | null | undefined): string {
  return `/admin/curation?status=${encodeURIComponent(status || "all")}`;
}

/**
 * POST /api/admin/curation/youtube-candidate
 * Creates a lightweight curation candidate from a YouTube URL or video key.
 */
export async function POST(request: Request) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: YouTubeCandidateBody;
  try {
    body = (await request.json()) as YouTubeCandidateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const videoKey = extractYouTubeVideoKey(body.youtube_url_or_key ?? "");
  if (!videoKey) {
    return NextResponse.json(
      { error: "YouTube URLまたはvideo keyを確認してください" },
      { status: 400 },
    );
  }

  const contentType = VALID_CONTENT_TYPES.includes(body.content_type as ContentType)
    ? (body.content_type as ContentType)
    : "movie";
  const trailerType = cleanText(body.trailer_type, 64) ?? "Trailer";
  const sourceUrl =
    cleanText(body.source_url, 500) ?? getYouTubeWatchUrl(videoKey);
  const curatorNote = cleanText(body.curator_note, 1000);
  const thumbnailUrl = getYouTubeThumbnail(videoKey);

  try {
    const supabase = getSupabaseServiceClient();

    const { data: existing } = await supabase
      .from("content_trailers")
      .select("id, content_id, youtube_video_key")
      .eq("youtube_video_key", videoKey)
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { data: content } = await supabase
        .from("contents")
        .select("id, title, curation_status")
        .eq("id", existing.content_id)
        .maybeSingle();

      const status =
        typeof content?.curation_status === "string"
          ? content.curation_status
          : null;
      return NextResponse.json({
        ok: true,
        duplicate: true,
        contentId: existing.content_id,
        trailerId: existing.id,
        youtubeVideoKey: videoKey,
        title: content?.title ?? null,
        curationStatus: status,
        adminUrl: adminUrlFor(status),
        message: "このYouTube動画は既に登録済みです",
      });
    }

    const metadata = await fetchYouTubeVideoMetadata(videoKey);
    const title =
      cleanText(body.title, 200) ??
      cleanText(metadata.title, 200) ??
      `YouTube trailer ${videoKey}`;
    const overview = cleanText(metadata.description, 800) ?? "";
    const durationSeconds = metadata.durationSeconds;
    const tags = buildCandidateTags(contentType, trailerType);

    const { data: contentRow, error: contentError } = await supabase
      .from("contents")
      .insert({
        content_type: contentType,
        title,
        overview,
        short_copy: "",
        language: "ja",
        thumbnail_url: thumbnailUrl,
        poster_url: thumbnailUrl,
        source: "youtube",
        curation_status: "candidate",
        quality_score: 50,
        is_active: true,
      })
      .select("id")
      .single();

    if (contentError || !contentRow) {
      throw new Error(contentError?.message ?? "content insert failed");
    }

    const contentId = contentRow.id as number;

    const { data: trailerRow, error: trailerError } = await supabase
      .from("content_trailers")
      .insert({
        content_id: contentId,
        youtube_video_key: videoKey,
        title,
        channel_title: metadata.channelTitle,
        channel_id: metadata.channelId,
        language: "ja",
        type: trailerType,
        official: null,
        official_level: "unknown",
        embed_status: "unknown",
        source_url: sourceUrl,
        duration_seconds: durationSeconds,
        curator_note: curatorNote,
        published_at: metadata.publishedAt,
        thumbnail_url: thumbnailUrl,
        is_active: true,
      })
      .select("id")
      .single();

    if (trailerError || !trailerRow) {
      throw new Error(trailerError?.message ?? "trailer insert failed");
    }

    if (tags.length > 0) {
      await supabase.from("content_tags").insert(
        tags.map((tag) => ({ content_id: contentId, tag })),
      );
    }

    return NextResponse.json({
      ok: true,
      duplicate: false,
      contentId,
      trailerId: trailerRow.id,
      youtubeVideoKey: videoKey,
      title,
      durationSeconds,
      durationBucket: getDurationBucket(durationSeconds),
      adminUrl: adminUrlFor("candidate"),
      message: "候補として保存しました",
    });
  } catch (err) {
    console.error("/api/admin/curation/youtube-candidate POST failed", err);
    return NextResponse.json(
      { error: "候補の作成に失敗しました" },
      { status: 500 },
    );
  }
}
