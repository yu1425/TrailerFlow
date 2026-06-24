/**
 * Feed integration test (no Next server required).
 *
 * Asserts the most important public-beta invariant: a content whose
 * curation_status is NOT "approved" (e.g. needs_review / draft / rejected)
 * must NEVER appear in the feed — across every channel, many iterations, and
 * with varying recently-watched exclusions (which exercises the relaxed and
 * last-resort fallback passes).
 *
 * Also sanity-checks that the opening slots stay strong (high quality_score).
 *
 * Usage:
 *   export $(grep -v '^#' .env.local | xargs) && npm run test:feed
 */

import { createClient } from "@supabase/supabase-js";
import { buildContentFeed } from "@/lib/contentFeed";
import { CHANNELS } from "@/lib/feed";

const ITERATIONS_PER_CHANNEL = 25;
const LIMIT = 30;
const OPENER_MIN_AVG_QUALITY = 80; // first 3 should be strong

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Collect the video keys that must never surface (anything not approved).
  const { data: blocked } = await supabase
    .from("contents")
    .select("title, curation_status, content_trailers(youtube_video_key)")
    .neq("curation_status", "approved");
  const blockedKeys = new Map<string, string>(); // key -> "title (status)"
  for (const c of blocked ?? []) {
    for (const t of (c as { content_trailers?: { youtube_video_key: string }[] })
      .content_trailers ?? []) {
      blockedKeys.set(
        t.youtube_video_key,
        `${(c as { title: string }).title} (${(c as { curation_status: string }).curation_status})`,
      );
    }
  }

  // Quality lookup for opener strength check.
  const { data: approved } = await supabase
    .from("contents")
    .select("quality_score, content_trailers(youtube_video_key)")
    .eq("curation_status", "approved");
  const qualityByKey = new Map<string, number>();
  for (const c of approved ?? []) {
    for (const t of (c as { content_trailers?: { youtube_video_key: string }[] })
      .content_trailers ?? []) {
      qualityByKey.set(
        t.youtube_video_key,
        (c as { quality_score: number }).quality_score ?? 50,
      );
    }
  }

  console.log(`Blocked (non-approved) trailer keys: ${blockedKeys.size}`);
  console.log(`Approved trailer keys: ${qualityByKey.size}`);
  console.log(
    `Running ${CHANNELS.length} channels × ${ITERATIONS_PER_CHANNEL} iterations …\n`,
  );

  const violations: string[] = [];
  let runs = 0;
  let openerSampleCount = 0;
  let openerQualitySum = 0;

  for (const channel of CHANNELS) {
    for (let i = 0; i < ITERATIONS_PER_CHANNEL; i++) {
      // Randomly exclude some ids to push into relaxed / last-resort passes.
      const excludeContentIds =
        i % 3 === 0
          ? Array.from({ length: 40 }, () => Math.floor(Math.random() * 80))
          : [];

      const result = await buildContentFeed(supabase, {
        anonymousUserId: `test-${channel.id}-${i}`,
        channel: channel.id,
        limit: LIMIT,
        preferredLanguage: i % 2 === 0 ? "ja" : "en",
        excludeContentIds,
      });
      const items = result.items;
      runs++;

      for (const it of items) {
        const key = it.trailer.videoKey;
        if (blockedKeys.has(key)) {
          violations.push(
            `channel=${channel.id} iter=${i}: leaked ${key} → ${blockedKeys.get(key)}`,
          );
        }
      }

      // Opener strength (only meaningful for non-random channels with enough pool).
      if (channel.config.sort !== "random" && items.length >= 3) {
        for (const it of items.slice(0, 3)) {
          const q = qualityByKey.get(it.trailer.videoKey);
          if (q !== undefined) {
            openerQualitySum += q;
            openerSampleCount++;
          }
        }
      }
    }
  }

  const openerAvg =
    openerSampleCount > 0 ? openerQualitySum / openerSampleCount : 0;

  console.log(`Completed ${runs} feed builds.`);
  console.log(
    `Opener (first-3) average quality_score: ${openerAvg.toFixed(1)} (target ≥ ${OPENER_MIN_AVG_QUALITY})\n`,
  );

  let failed = false;

  if (violations.length > 0) {
    failed = true;
    console.error(`❌ FAIL: ${violations.length} non-approved leak(s) into feed:`);
    for (const v of violations.slice(0, 20)) console.error("   " + v);
  } else {
    console.log("✅ PASS: no non-approved content ever appeared in the feed.");
  }

  if (openerAvg < OPENER_MIN_AVG_QUALITY) {
    failed = true;
    console.error(
      `❌ FAIL: opener average quality ${openerAvg.toFixed(1)} below target ${OPENER_MIN_AVG_QUALITY}.`,
    );
  } else {
    console.log("✅ PASS: opening slots stay high-quality.");
  }

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
