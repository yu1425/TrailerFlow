import type { EventType, UserEventInput } from "@/types/events";

/**
 * Client-side helper for recording user events. Fire-and-forget: event
 * tracking should never block or break the playback UX.
 */

export interface TrackEventArgs {
  anonymousUserId: string;
  movieId: number;
  trailerId: number;
  eventType: EventType;
  channel?: string | null;
  watchSeconds?: number | null;
  videoDuration?: number | null;
}

export async function trackEvent(args: TrackEventArgs): Promise<void> {
  const body: UserEventInput = {
    anonymousUserId: args.anonymousUserId,
    movieId: args.movieId,
    trailerId: args.trailerId,
    eventType: args.eventType,
    channel: args.channel ?? null,
    watchSeconds: args.watchSeconds ?? null,
    videoDuration: args.videoDuration ?? null,
  };

  try {
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch (err) {
    // Never throw from analytics.
    console.warn("trackEvent failed", err);
  }
}
