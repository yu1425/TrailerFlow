import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type {
  CurationStatus,
  CurationUpdateInput,
  ContentWithRelations,
  CurationListItem,
} from "@/types/content";

export const dynamic = "force-dynamic";

const VALID_STATUSES: CurationStatus[] = [
  "draft",
  "candidate",
  "approved",
  "rejected",
  "needs_review",
];

function verifyAdmin(request: Request): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function toListItem(row: ContentWithRelations): CurationListItem {
  const primary = row.content_trailers?.[0] ?? null;
  return {
    id: row.id,
    contentType: row.content_type,
    title: row.title,
    shortCopy: row.short_copy,
    curationStatus: row.curation_status,
    source: row.source,
    qualityScore: row.quality_score,
    language: row.language,
    thumbnailUrl: row.thumbnail_url,
    trailerCount: row.content_trailers?.length ?? 0,
    primaryVideoKey: primary?.youtube_video_key ?? null,
    channelTitle: primary?.channel_title ?? null,
    durationSeconds: primary?.duration_seconds ?? null,
    trailerType: primary?.type ?? null,
    officialLevel: primary?.official_level ?? null,
    embedStatus: primary?.embed_status ?? null,
    sourceUrl: primary?.source_url ?? null,
    curatorNote: primary?.curator_note ?? null,
    firehoseVisible: Boolean(row.firehose_visible || primary?.firehose_visible),
    autoCollected: Boolean(row.auto_collected || primary?.auto_collected),
    autoScore: row.auto_score ?? primary?.auto_score ?? null,
    warningFlags: [
      ...(row.warning_flags ?? []),
      ...(primary?.warning_flags ?? []),
    ],
    sourceType: row.source_type ?? primary?.source_type ?? null,
    discoveryReason:
      row.discovery_reason ?? primary?.discovery_reason ?? null,
    tags: (row.content_tags ?? []).map((t) => t.tag),
    createdAt: row.created_at,
  };
}

/**
 * GET /api/admin/curation?status=candidate&limit=50
 * Lists curated contents for the admin UI.
 */
export async function GET(request: Request) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as CurationStatus | null;
  const limitParam = searchParams.get("limit");
  let limit = limitParam ? Number.parseInt(limitParam, 10) : 50;
  if (!Number.isFinite(limit) || limit <= 0) limit = 50;
  limit = Math.min(limit, 200);

  try {
    const supabase = getSupabaseServiceClient();
    let query = supabase
      .from("contents")
      .select(
        `*, content_trailers (*), content_tags (tag)`,
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status && VALID_STATUSES.includes(status)) {
      query = query.eq("curation_status", status);
    }

    const { data, error } = await query;
    if (error) throw error;

    const items = ((data ?? []) as unknown as ContentWithRelations[]).map(
      toListItem,
    );

    // Status counts across the whole table (independent of the active filter),
    // so the admin UI can show totals on each tab.
    const counts: Record<string, number> = {};
    await Promise.all(
      VALID_STATUSES.map(async (s) => {
        const { count } = await supabase
          .from("contents")
          .select("id", { count: "exact", head: true })
          .eq("curation_status", s);
        counts[s] = count ?? 0;
      }),
    );
    counts.all = Object.values(counts).reduce((a, b) => a + b, 0);

    return NextResponse.json({ items, counts });
  } catch (err) {
    console.error("/api/admin/curation GET failed", err);
    return NextResponse.json(
      { error: "Failed to list contents" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/admin/curation
 * Body: { id: number, ...CurationUpdateInput }
 * Updates a single content's curation fields.
 */
export async function PATCH(request: Request) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CurationUpdateInput & { id?: number };
  try {
    body = (await request.json()) as CurationUpdateInput & { id?: number };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contentId = body.id;
  if (typeof contentId !== "number") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServiceClient();

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.title !== undefined) updates.title = body.title;
    if (body.overview !== undefined) updates.overview = body.overview;
    if (body.shortCopy !== undefined) updates.short_copy = body.shortCopy;
    if (
      body.curationStatus &&
      VALID_STATUSES.includes(body.curationStatus)
    ) {
      updates.curation_status = body.curationStatus;
    }
    if (
      typeof body.qualityScore === "number" &&
      body.qualityScore >= 0 &&
      body.qualityScore <= 100
    ) {
      updates.quality_score = body.qualityScore;
    }
    if (body.contentType !== undefined) {
      updates.content_type = body.contentType;
    }

    const { error: updateError } = await supabase
      .from("contents")
      .update(updates)
      .eq("id", contentId);
    if (updateError) throw updateError;

    // Update tags if provided.
    if (Array.isArray(body.tags)) {
      await supabase
        .from("content_tags")
        .delete()
        .eq("content_id", contentId);
      if (body.tags.length > 0) {
        await supabase.from("content_tags").insert(
          body.tags.map((tag) => ({ content_id: contentId, tag })),
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("/api/admin/curation PATCH failed", err);
    return NextResponse.json(
      { error: "Failed to update content" },
      { status: 500 },
    );
  }
}
