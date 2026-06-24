"use client";

export interface NextUpOverlayProps {
  visible: boolean;
  title: string | null;
}

/**
 * Brief interstitial shown over the player while the next trailer loads.
 * Prevents the jarring black flash between videos and announces what's next,
 * like a cinema "次回上映" card.
 */
export default function NextUpOverlay({ visible, title }: NextUpOverlayProps) {
  return (
    <div
      className={[
        "pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center bg-lobby-bg px-6 text-center transition-opacity duration-300",
        visible ? "opacity-100" : "opacity-0",
      ].join(" ")}
      aria-hidden={!visible}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(circle at 50% 45%, var(--accent-soft), transparent 60%)",
        }}
      />
      <div className="relative">
        <p className="mb-3 text-xs uppercase tracking-[0.35em] text-accent">
          Next Up · 次の予告編
        </p>
        {title ? (
          <p className="max-w-md text-2xl font-bold leading-snug text-white sm:text-3xl">
            {title}
          </p>
        ) : (
          <p className="text-lg text-white/50">まもなく…</p>
        )}
      </div>
    </div>
  );
}
