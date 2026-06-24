"use client";

export interface WatchlistButtonProps {
  isWatchlisted: boolean;
  onToggle: () => void;
  className?: string;
}

/**
 * Standalone "観たい" toggle. Used outside the ActionBar (e.g. on the watchlist
 * page rows) where a single, self-contained control is handy.
 */
export default function WatchlistButton({
  isWatchlisted,
  onToggle,
  className = "",
}: WatchlistButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isWatchlisted}
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition active:scale-95",
        isWatchlisted
          ? "bg-accent-soft text-accent"
          : "bg-accent text-accent-contrast hover:brightness-110",
        className,
      ].join(" ")}
    >
      <span aria-hidden>{isWatchlisted ? "★" : "☆"}</span>
      {isWatchlisted ? "観たいリスト登録済み" : "観たい"}
    </button>
  );
}
