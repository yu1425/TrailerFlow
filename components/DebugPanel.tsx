"use client";

import { useEffect, useState } from "react";

export interface DebugStats {
  sessionStartedAt: number;
  trailersWatched: number;
  trailersSkipped: number;
  watchlistAdds: number;
  averageWatchSeconds: number;
  currentQueueLength: number;
}

export interface DebugPanelProps {
  stats: DebugStats;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Dev-only KPI overlay. Rendered only when NEXT_PUBLIC_DEBUG_PANEL is enabled
 * (the parent guards this). Collapsible so it stays out of the way during
 * real-device testing.
 */
export default function DebugPanel({ stats }: DebugPanelProps) {
  // Collapsed by default on small screens so it never covers the player on a
  // phone; expanded by default on desktop where there's room.
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);

  // Open on first mount only when there's desktop room (≥1024px).
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches
    ) {
      setOpen(true);
    }
  }, []);

  // Tick once a second so the session timer stays live.
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const rows: [string, string | number][] = [
    ["session", formatElapsed(Date.now() - stats.sessionStartedAt)],
    ["watched", stats.trailersWatched],
    ["skipped", stats.trailersSkipped],
    ["watchlist+", stats.watchlistAdds],
    ["avg watch s", stats.averageWatchSeconds.toFixed(1)],
    ["queue len", stats.currentQueueLength],
  ];

  return (
    <div className="fixed bottom-24 right-3 z-[60] select-none font-mono text-[11px] leading-tight lg:bottom-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="ml-auto block rounded-md bg-black/70 px-2 py-1 text-white/70 ring-1 ring-white/10 backdrop-blur hover:text-white"
      >
        {open ? "✕ debug" : "▸ debug"}
      </button>
      {open ? (
        <div className="mt-1 w-44 rounded-lg bg-black/75 p-3 text-white/80 ring-1 ring-white/10 backdrop-blur">
          <p className="mb-2 text-[10px] uppercase tracking-widest text-accent">
            session KPIs
          </p>
          <dl className="space-y-1">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2">
                <dt className="text-white/45">{label}</dt>
                <dd className="tabular-nums text-white">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
