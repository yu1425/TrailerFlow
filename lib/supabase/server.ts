import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the service role key.
 *
 * MUST only be imported from server code (API routes, server components,
 * scripts). The service role key bypasses RLS, so it must never reach the
 * browser bundle.
 */
let serviceClient: SupabaseClient | null = null;

export function getSupabaseServiceClient(): SupabaseClient {
  if (serviceClient) return serviceClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  serviceClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Next.js patches global fetch and caches it by default in the App
      // Router. supabase-js uses fetch under the hood, so without this the
      // feed/admin queries get served from a stale Next data cache (e.g. the
      // contents pool frozen from before a new import). Force no-store so
      // every query reflects the live database.
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  return serviceClient;
}
