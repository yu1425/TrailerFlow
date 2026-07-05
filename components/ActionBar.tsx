"use client";

export interface ActionBarProps {
  onNext: () => void;
  onLike: () => void;
  onDislike: () => void;
  onWatchlist: () => void;
  onDetails: () => void;
  onMuteToggle: () => void;
  muted: boolean;
  isWatchlisted: boolean;
}

interface ActionButtonProps {
  label: string;
  icon: string;
  onClick: () => void;
  active?: boolean;
  emphasized?: boolean;
}

function ActionButton({
  label,
  icon,
  onClick,
  active,
  emphasized,
}: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={[
        "flex min-h-[60px] min-w-[68px] flex-col items-center justify-center gap-1 rounded-2xl px-3 py-2.5 text-[11px] font-medium transition active:scale-95 sm:min-h-0 sm:text-xs",
        emphasized
          ? "bg-accent text-accent-contrast hover:brightness-110"
          : active
            ? "bg-accent-soft text-accent"
            : "bg-lobby-surface/80 text-white/80 hover:bg-lobby-surface hover:text-white",
      ].join(" ")}
    >
      <span className="text-2xl leading-none sm:text-xl" aria-hidden>
        {icon}
      </span>
      <span className="leading-none">{label}</span>
    </button>
  );
}

/**
 * Primary interaction bar. Big, thumb-friendly targets for mobile; horizontally
 * scrollable if it overflows on very narrow screens.
 */
export default function ActionBar({
  onNext,
  onLike,
  onDislike,
  onWatchlist,
  onDetails,
  onMuteToggle,
  muted,
  isWatchlisted,
}: ActionBarProps) {
  return (
    <div className="no-scrollbar touch-scroll flex items-center justify-start gap-2 overflow-x-auto px-3 py-3 sm:justify-center sm:gap-3">
      <ActionButton
        label={isWatchlisted ? "登録済み" : "観たい"}
        icon={isWatchlisted ? "★" : "☆"}
        onClick={onWatchlist}
        active={isWatchlisted}
        emphasized={!isWatchlisted}
      />
      <ActionButton label="この系統もっと" icon="♥" onClick={onLike} />
      <ActionButton label="今は違う" icon="✕" onClick={onDislike} />
      <ActionButton label="次へ" icon="⏭" onClick={onNext} />
      <ActionButton label="詳細" icon="ℹ" onClick={onDetails} />
      <ActionButton
        label={muted ? "ミュート中" : "音声ON"}
        icon={muted ? "🔇" : "🔊"}
        onClick={onMuteToggle}
        active={muted}
      />
    </div>
  );
}
