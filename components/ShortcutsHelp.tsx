"use client";

import { useState } from "react";

const SHORTCUTS: [string, string][] = [
  ["Space", "再生 / 一時停止"],
  ["→", "次へ"],
  ["W", "観たい"],
  ["L", "この系統もっと"],
  ["D", "今は違う"],
  ["M", "ミュート切替"],
  ["?", "このヘルプ"],
];

export interface ShortcutsHelpProps {
  open: boolean;
  onToggle: () => void;
}

/**
 * Small keyboard-shortcut reference. A persistent "⌨" button toggles a compact
 * legend; desktop-focused but harmless on touch devices.
 */
export default function ShortcutsHelp({ open, onToggle }: ShortcutsHelpProps) {
  return (
    <div className="fixed bottom-3 left-3 z-[55] hidden sm:block">
      <button
        type="button"
        onClick={onToggle}
        aria-label="キーボードショートカット"
        className="rounded-md bg-black/60 px-2 py-1 text-xs text-white/60 ring-1 ring-white/10 backdrop-blur hover:text-white"
      >
        ⌨ ショートカット
      </button>
      {open ? (
        <div className="mt-1 w-56 rounded-lg bg-black/80 p-3 text-xs text-white/80 ring-1 ring-white/10 backdrop-blur">
          <dl className="space-y-1.5">
            {SHORTCUTS.map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <dt>
                  <kbd className="rounded border border-white/20 bg-white/5 px-1.5 py-0.5 font-mono text-[11px]">
                    {key}
                  </kbd>
                </dt>
                <dd className="text-white/60">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

/** Convenience hook to manage the help panel's open state. */
export function useShortcutsHelp() {
  const [open, setOpen] = useState(false);
  return { open, toggle: () => setOpen((o) => !o), setOpen };
}
