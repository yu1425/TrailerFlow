import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface CandidateBody {
  title: string;
  originalTitle?: string | null;
  overview?: string | null;
  releaseDate?: string | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  genres?: string[];
  language?: string | null;
  youtubeVideoKey: string;
  trailerTitle?: string | null;
  trailerLanguage?: string | null;
  tmdbId?: number;
}

/**
 * POST /api/admin/curation/candidate
 * Saves a TMDb-discovered item as a Manual Curation candidate.
 * Skips if the youtube_video_key already exists in content_trailers.
 */
export async function POST(request: Request) {
  let body: CandidateBody;
  try {
    body = (await request.json()) as CandidateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.title || !body.youtubeVideoKey) {
    return NextResponse.json(
      { error: "title and youtubeVideoKey are required" },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseServiceClient();

    // Check for existing trailer with the same youtube_video_key.
    const { data: existing } = await supabase
      .from("content_trailers")
      .select("id, content_id")
      .eq("youtube_video_key", body.youtubeVideoKey)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        contentId: existing.content_id,
        message: "この予告編は既に登録済みです",
      });
    }

    // Insert the content row.
    const { data: contentRow, error: contentError } = await supabase
      .from("contents")
      .insert({
        content_type: "movie",
        title: body.title,
        original_title: body.originalTitle || null,
        overview: body.overview || null,
        release_date: body.releaseDate || null,
        poster_url: body.posterUrl || null,
        backdrop_url: body.backdropUrl || null,
        language: body.language || null,
        source: "tmdb",
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

    // Insert the trailer.
    await supabase.from("content_trailers").insert({
      content_id: contentId,
      youtube_video_key: body.youtubeVideoKey,
      title: body.trailerTitle || null,
      language: body.trailerLanguage || null,
      type: "Trailer",
      official: true,
      is_active: true,
    });

    // Insert genre tags.
    if (body.genres && body.genres.length > 0) {
      await supabase.from("content_tags").insert(
        body.genres.map((tag) => ({ content_id: contentId, tag })),
      );
    }

    return NextResponse.json({
      ok: true,
      duplicate: false,
      contentId,
      message: "候補として保存しました",
    });
  } catch (err) {
    console.error("/api/admin/curation/candidate POST failed", err);
    return NextResponse.json(
      { error: "Failed to save candidate" },
      { status: 500 },
    );
  }
}
