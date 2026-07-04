import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  DISCOVERY_SOURCE_TYPES,
} from "@/lib/discovery";
import type { DiscoverySourceType } from "@/types/content";

export const dynamic = "force-dynamic";

function verifyAdmin(request: Request): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function parseParams(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getSupabaseServiceClient();
    const { data: sources, error: sourceError } = await supabase
      .from("discovery_sources")
      .select("*")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false });
    if (sourceError) throw sourceError;

    const { data: jobs, error: jobError } = await supabase
      .from("discovery_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (jobError) throw jobError;

    return NextResponse.json({
      sources: sources ?? [],
      jobs: jobs ?? [],
      sourceTypes: DISCOVERY_SOURCE_TYPES,
    });
  } catch (err) {
    console.error("/api/admin/discovery/sources GET failed", err);
    return NextResponse.json(
      { error: "Failed to list discovery sources" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    source_type?: DiscoverySourceType;
    name?: string;
    query?: string;
    params?: unknown;
    enabled?: boolean;
    priority?: number;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.source_type || !DISCOVERY_SOURCE_TYPES.includes(body.source_type)) {
    return NextResponse.json({ error: "Invalid source_type" }, { status: 400 });
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("discovery_sources")
      .insert({
        source_type: body.source_type,
        name: body.name.trim(),
        query: body.query?.trim() || null,
        params: parseParams(body.params),
        enabled: body.enabled ?? true,
        priority:
          typeof body.priority === "number"
            ? Math.max(0, Math.min(100, body.priority))
            : 50,
        notes: body.notes?.trim() || null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, source: data });
  } catch (err) {
    console.error("/api/admin/discovery/sources POST failed", err);
    return NextResponse.json(
      { error: "Failed to create discovery source" },
      { status: 500 },
    );
  }
}
