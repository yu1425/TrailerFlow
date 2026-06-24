/**
 * Import curated trailers from data/manual-trailers.csv into Supabase.
 *
 * Usage:
 *   export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/import-manual-trailers.ts
 *
 * Expects CSV columns:
 *   content_type,title,original_title,overview,short_copy,release_date,
 *   genres,tags,language,country,official_url,youtube_video_key,
 *   trailer_title,channel_title,channel_id
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

function getYouTubeThumbnail(key: string): string {
  return `https://img.youtube.com/vi/${key}/hqdefault.jpg`;
}

interface CsvRow {
  content_type: string;
  title: string;
  original_title: string;
  overview: string;
  short_copy: string;
  release_date: string;
  genres: string;
  tags: string;
  language: string;
  country: string;
  official_url: string;
  youtube_video_key: string;
  trailer_title: string;
  channel_title: string;
  channel_id: string;
  /** Optional. 0–100; defaults to 50 when absent. */
  quality_score?: string;
  /** Optional. draft|candidate|approved|rejected|needs_review; defaults to draft. */
  curation_status?: string;
}

const VALID_STATUSES = [
  "draft",
  "candidate",
  "approved",
  "rejected",
  "needs_review",
];

function parseQualityScore(raw: string | undefined): number {
  const n = Number.parseInt((raw ?? "").trim(), 10);
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(0, n));
}

function parseStatus(raw: string | undefined): string {
  const s = (raw ?? "").trim();
  return VALID_STATUSES.includes(s) ? s : "draft";
}

function parseCsv(raw: string): CsvRow[] {
  const lines = raw.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Simple CSV parse that handles quoted fields with commas.
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    values.push(current.trim());

    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] ?? "";
    });
    rows.push(obj as unknown as CsvRow);
  }

  return rows;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const csvPath = resolve(process.cwd(), "data/manual-trailers.csv");
  let raw: string;
  try {
    raw = readFileSync(csvPath, "utf-8");
  } catch {
    console.error(`Cannot read ${csvPath}`);
    process.exit(1);
  }

  const rows = parseCsv(raw);
  console.log(`Parsed ${rows.length} row(s) from CSV.`);
  if (rows.length === 0) return;

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let imported = 0;
  let errors = 0;

  for (const row of rows) {
    if (!row.title || !row.youtube_video_key) {
      console.warn(`Skipping row: missing title or youtube_video_key`);
      errors++;
      continue;
    }

    try {
      const thumbnailUrl = getYouTubeThumbnail(row.youtube_video_key);
      const qualityScore = parseQualityScore(row.quality_score);
      const curationStatus = parseStatus(row.curation_status);

      // Upsert content. Use title + content_type as a soft de-dupe key.
      const { data: existing } = await supabase
        .from("contents")
        .select("id")
        .eq("title", row.title)
        .eq("content_type", row.content_type || "movie")
        .maybeSingle();

      let contentId: number;
      if (existing) {
        contentId = existing.id as number;
        // The CSV is the source of truth: re-importing reconciles quality_score
        // and curation_status too, so the file fully describes the feed.
        await supabase
          .from("contents")
          .update({
            original_title: row.original_title || null,
            overview: row.overview || null,
            short_copy: row.short_copy || null,
            release_date: row.release_date || null,
            language: row.language || null,
            country: row.country || null,
            official_url: row.official_url || null,
            thumbnail_url: thumbnailUrl,
            quality_score: qualityScore,
            curation_status: curationStatus,
            source: "manual",
            updated_at: new Date().toISOString(),
          })
          .eq("id", contentId);
      } else {
        const { data: inserted, error } = await supabase
          .from("contents")
          .insert({
            content_type: row.content_type || "movie",
            title: row.title,
            original_title: row.original_title || null,
            overview: row.overview || null,
            short_copy: row.short_copy || null,
            release_date: row.release_date || null,
            language: row.language || null,
            country: row.country || null,
            official_url: row.official_url || null,
            thumbnail_url: thumbnailUrl,
            quality_score: qualityScore,
            source: "manual",
            curation_status: curationStatus,
          })
          .select("id")
          .single();
        if (error || !inserted) throw error ?? new Error("Insert returned no id");
        contentId = inserted.id as number;
      }

      // Upsert trailer.
      await supabase.from("content_trailers").upsert(
        {
          content_id: contentId,
          youtube_video_key: row.youtube_video_key,
          title: row.trailer_title || row.title,
          channel_title: row.channel_title || null,
          channel_id: row.channel_id || null,
          language: row.language || null,
          type: "Trailer",
          official: true,
          thumbnail_url: thumbnailUrl,
          is_active: true,
        },
        { onConflict: "youtube_video_key" },
      );

      // Tags = genres + tags columns merged.
      const allTags = [
        ...((row.genres || "").split(",").map((s) => s.trim()).filter(Boolean)),
        ...((row.tags || "").split(",").map((s) => s.trim()).filter(Boolean)),
      ];
      const uniqueTags = Array.from(new Set(allTags));

      // Clear existing tags and re-insert.
      await supabase.from("content_tags").delete().eq("content_id", contentId);
      if (uniqueTags.length > 0) {
        await supabase.from("content_tags").insert(
          uniqueTags.map((tag) => ({ content_id: contentId, tag })),
        );
      }

      imported++;
      console.log(
        `  ✓ ${row.title} [${curationStatus} q${qualityScore}] (${row.youtube_video_key})`,
      );
    } catch (err) {
      errors++;
      console.error(`  ✗ ${row.title}: ${(err as Error).message}`);
    }
  }

  console.log(`\nDone. Imported: ${imported}, Errors: ${errors}`);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
