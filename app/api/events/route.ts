import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { applyEventToProfile } from "@/lib/profile";
import type { EventType, UserEventInput } from "@/types/events";

export const dynamic = "force-dynamic";

const VALID_EVENTS: EventType[] = [
  "play_start",
  "play_end",
  "skip",
  "like",
  "dislike",
  "watchlist_add",
  "watchlist_remove",
  "details_open",
  "channel_change",
];

function isValidEvent(value: unknown): value is EventType {
  return typeof value === "string" && VALID_EVENTS.includes(value as EventType);
}

/**
 * POST /api/events
 * Records a user event and updates the anonymous profile accordingly.
 */
export async function POST(request: Request) {
  let payload: Partial<UserEventInput>;
  try {
    payload = (await request.json()) as Partial<UserEventInput>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { anonymousUserId, movieId, trailerId, eventType } = payload;

  if (!anonymousUserId || typeof anonymousUserId !== "string") {
    return NextResponse.json(
      { error: "anonymousUserId is required" },
      { status: 400 },
    );
  }
  if (!isValidEvent(eventType)) {
    return NextResponse.json(
      { error: "Invalid or missing eventType" },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseServiceClient();

    const { error: insertError } = await supabase.from("user_events").insert({
      anonymous_user_id: anonymousUserId,
      movie_id: typeof movieId === "number" ? movieId : null,
      trailer_id: typeof trailerId === "number" ? trailerId : null,
      event_type: eventType,
      channel: payload.channel ?? null,
      watch_seconds:
        typeof payload.watchSeconds === "number" ? payload.watchSeconds : null,
      video_duration:
        typeof payload.videoDuration === "number"
          ? payload.videoDuration
          : null,
    });

    if (insertError) {
      console.error("Failed to insert user_event", insertError);
      return NextResponse.json(
        { error: "Failed to record event" },
        { status: 500 },
      );
    }

    // Update derived profile state. Needs a concrete movieId.
    if (typeof movieId === "number") {
      await applyEventToProfile(supabase, anonymousUserId, eventType, movieId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("/api/events failed", err);
    return NextResponse.json(
      { error: "Failed to record event" },
      { status: 500 },
    );
  }
}
