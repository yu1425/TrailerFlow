"use client";

export interface StartOverlayProps {
  onStart: () => void;
}

/**
 * Full-screen entry gate. Required because browsers block autoplay until the
 * user interacts — the button click is that interaction.
 */
export default function StartOverlay({ onStart }: StartOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-lobby-bg px-6 text-center">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(circle at 50% 30%, var(--accent-soft), transparent 60%)",
        }}
      />
      <div className="relative flex flex-col items-center animate-fade-in">
        <p className="mb-3 text-sm uppercase tracking-[0.3em] text-accent">
          Now Showing
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          Trailer<span className="text-accent">Flow</span>
        </h1>
        <p className="mt-5 max-w-md text-xl font-bold text-white sm:text-2xl">
          映画館の予告編タイムを、ずっと。
        </p>
        <p className="mt-3 max-w-md text-base text-white/70 sm:text-lg">
          探さなくていい。次の観たい一本が流れてくる。
        </p>

        <button
          type="button"
          onClick={onStart}
          className="mt-10 rounded-full bg-accent px-10 py-4 text-lg font-bold text-accent-contrast shadow-lg shadow-accent/20 transition hover:scale-105 hover:brightness-110 active:scale-95"
        >
          予告編を浴びはじめる
        </button>

        <p className="mt-6 max-w-xs text-xs text-white/40">
          ミュートからはじまります。下のミュートボタンで音声をオンにできます。
        </p>
      </div>
    </div>
  );
}
