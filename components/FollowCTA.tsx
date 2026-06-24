"use client";

/**
 * X (Twitter) follow / share导线. The handle is configurable via
 * NEXT_PUBLIC_X_HANDLE so it can be set per-deploy without code changes.
 * Falls back to a placeholder during local development.
 */

const X_HANDLE = process.env.NEXT_PUBLIC_X_HANDLE ?? "trailerflow";
const X_URL = `https://x.com/${X_HANDLE}`;

export interface FollowCTAProps {
  /** "card" = boxed callout (About/footer); "inline" = compact button. */
  variant?: "card" | "inline";
  className?: string;
}

export default function FollowCTA({
  variant = "card",
  className = "",
}: FollowCTAProps) {
  if (variant === "inline") {
    return (
      <a
        href={X_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={[
          "inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/20 hover:text-white",
          className,
        ].join(" ")}
      >
        𝕏 @{X_HANDLE} をフォロー
      </a>
    );
  }

  return (
    <div
      className={[
        "rounded-2xl border border-lobby-border bg-lobby-surface p-5",
        className,
      ].join(" ")}
    >
      <p className="text-sm font-bold text-white">
        TrailerFlow は開発中です。
      </p>
      <p className="mt-1 text-sm text-white/60">
        気に入ったら、ぜひフォローして開発を見守ってください。新しいチャンネルや作品の追加をお知らせします。
      </p>
      <a
        href={X_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2 text-sm font-bold text-black transition hover:brightness-90"
      >
        𝕏 @{X_HANDLE} をフォロー
      </a>
    </div>
  );
}
