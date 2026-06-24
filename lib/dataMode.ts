import type { DataMode } from "@/types/content";

/**
 * Returns the configured data mode.
 *
 * - "manual"  — public beta: only approved curated contents
 * - "tmdb"    — personal/local: TMDb movies only (original behaviour)
 * - "mixed"   — curated contents first, TMDb as fallback
 *
 * Set via DATA_MODE (server) or NEXT_PUBLIC_DATA_MODE (client). Defaults to
 * "mixed" so both datasets work out of the box during development.
 */
export function getDataMode(): DataMode {
  const raw =
    process.env.DATA_MODE ??
    process.env.NEXT_PUBLIC_DATA_MODE ??
    "mixed";
  if (raw === "manual" || raw === "tmdb" || raw === "mixed") return raw;
  return "mixed";
}
