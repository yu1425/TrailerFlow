import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { syncTmdb } from "@/lib/sync";

export const dynamic = "force-dynamic";
// Sync can take a while; give it room on platforms that honour this.
export const maxDuration = 300;

/**
 * POST /api/admin/sync/tmdb
 *
 * Pulls popular / now playing / upcoming / top rated movies from TMDb plus
 * their best trailer, and upserts them into Supabase.
 *
 * Auth: if ADMIN_SECRET is set, requires "Authorization: Bearer <ADMIN_SECRET>".
 * If unset (local/dev convenience), the endpoint is open — set ADMIN_SECRET in
 * any shared/production environment.
 *
 * Optional body: { "pages": number } to pull more pages from each list.
 */
export async function POST(request: Request) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (adminSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${adminSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let pages = 1;
  try {
    const body = (await request.json()) as { pages?: unknown };
    if (typeof body.pages === "number" && body.pages > 0) {
      pages = Math.min(Math.floor(body.pages), 10);
    }
  } catch {
    // No/invalid body — use defaults.
  }

  try {
    const supabase = getSupabaseServiceClient();
    const result = await syncTmdb(supabase, { pages });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("/api/admin/sync/tmdb failed", err);
    return NextResponse.json(
      { error: "Sync failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}
