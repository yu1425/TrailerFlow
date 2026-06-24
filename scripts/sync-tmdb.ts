/**
 * CLI TMDb sync.
 *
 * Usage:
 *   npm run sync:tmdb            # 1 page from each list
 *   npm run sync:tmdb -- 3       # 3 pages from each list
 *
 * Loads env from .env / .env.local automatically via Node's --env-file is not
 * assumed; instead we read process.env and rely on the shell or a tool like
 * `dotenv`. The npm script uses tsx; export env vars before running, e.g.
 *   export $(grep -v '^#' .env.local | xargs) && npm run sync:tmdb
 */
import { createClient } from "@supabase/supabase-js";
import { syncTmdb } from "../lib/sync";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
    );
    process.exit(1);
  }
  if (!process.env.TMDB_ACCESS_TOKEN) {
    console.error("Missing TMDB_ACCESS_TOKEN.");
    process.exit(1);
  }

  const pagesArg = process.argv[2];
  const pages = pagesArg ? Math.max(1, Number.parseInt(pagesArg, 10) || 1) : 1;

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Starting TMDb sync (${pages} page(s) per list)…`);
  const result = await syncTmdb(supabase, { pages });

  console.log("Sync complete:");
  console.log(`  genres synced:      ${result.genres}`);
  console.log(`  movies processed:   ${result.moviesProcessed}`);
  console.log(`  movies upserted:    ${result.moviesUpserted}`);
  console.log(`  trailers upserted:  ${result.trailersUpserted}`);
  if (result.errors.length > 0) {
    console.log(`  errors (${result.errors.length}):`);
    for (const e of result.errors) console.log(`    - ${e}`);
  }
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
