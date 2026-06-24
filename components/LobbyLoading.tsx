"use client";

import { useEffect, useState } from "react";

const MESSAGES = [
  "ロビーを開いています…",
  "予告編を準備しています…",
  "上映スケジュールを確認しています…",
  "まもなく予告編タイムが始まります…",
];

export interface LobbyLoadingProps {
  /** When true, shows the error/retry state instead of the spinner. */
  error?: boolean;
  onRetry?: () => void;
}

/**
 * Cinema-lobby flavored loading screen for the initial feed fetch.
 * Cycles through reassuring copy; switches to a retry CTA on error.
 */
export default function LobbyLoading({ error, onRetry }: LobbyLoadingProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (error) return;
    const interval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % MESSAGES.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [error]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-lobby-bg px-6 text-center">
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          background:
            "radial-gradient(circle at 50% 35%, var(--accent-soft), transparent 65%)",
        }}
      />
      <div className="relative flex flex-col items-center">
        <p className="mb-6 text-xs uppercase tracking-[0.35em] text-accent">
          TrailerFlow
        </p>

        {error ? (
          <>
            <p className="text-lg text-white/80">
              予告編を読み込めませんでした。
            </p>
            <p className="mt-2 max-w-xs text-sm text-white/40">
              通信状況を確認して、もう一度お試しください。
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-8 rounded-full bg-accent px-8 py-3 text-base font-bold text-accent-contrast transition hover:brightness-110 active:scale-95"
            >
              再試行する
            </button>
          </>
        ) : (
          <>
            {/* Marquee-style pulsing dots */}
            <div className="flex items-center gap-2">
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  className="h-3 w-3 rounded-full bg-accent"
                  style={{
                    animation: "fade-in 0.9s ease-in-out infinite alternate",
                    animationDelay: `${d * 0.25}s`,
                  }}
                />
              ))}
            </div>
            <p className="mt-6 text-base text-white/70 transition-opacity">
              {MESSAGES[messageIndex]}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
