import { NextResponse } from "next/server";
import { runDiscoverySource } from "@/lib/discovery";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { DiscoverySourceRow } from "@/types/content";

export const dynamic = "force-dynamic";

function verifyAdmin(request: Request): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sourceId = Number.parseInt(params.id, 10);
  if (!Number.isFinite(sourceId)) {
    return NextResponse.json({ error: "Invalid source id" }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();

  try {
    const { data: source, error: sourceError } = await supabase
      .from("discovery_sources")
      .select("*")
      .eq("id", sourceId)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    const startedAt = new Date().toISOString();
    const { data: job, error: jobError } = await supabase
      .from("discovery_jobs")
      .insert({
        source_id: sourceId,
        status: "running",
        started_at: startedAt,
        cursor_before: source.next_cursor ?? null,
      })
      .select("id")
      .single();
    if (jobError || !job) {
      throw new Error(jobError?.message ?? "job insert failed");
    }

    const result = await runDiscoverySource(
      supabase,
      source as unknown as DiscoverySourceRow,
    );
    const finishedAt = new Date().toISOString();
    const status = result.errorCount > 0 && result.collectedCount === 0
      ? "failed"
      : "completed";

    const { error: updateJobError } = await supabase
      .from("discovery_jobs")
      .update({
        status,
        finished_at: finishedAt,
        collected_count: result.collectedCount,
        duplicate_count: result.duplicateCount,
        skipped_count: result.skippedCount,
        error_count: result.errorCount,
        error_message: result.errorMessage,
        cursor_after: result.cursorAfter,
      })
      .eq("id", job.id);
    if (updateJobError) throw updateJobError;

    const { error: updateSourceError } = await supabase
      .from("discovery_sources")
      .update({
        last_run_at: finishedAt,
        next_cursor: result.cursorAfter,
        total_collected_count:
          (source.total_collected_count ?? 0) + result.collectedCount,
        updated_at: finishedAt,
      })
      .eq("id", sourceId);
    if (updateSourceError) throw updateSourceError;

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      status,
      ...result,
    });
  } catch (err) {
    console.error("/api/admin/discovery/sources/[id]/run POST failed", err);
    return NextResponse.json(
      { error: "Failed to run discovery source" },
      { status: 500 },
    );
  }
}
