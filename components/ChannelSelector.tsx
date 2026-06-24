"use client";

import type { ChannelDefinition } from "@/lib/feed";
import { VISIBLE_CHANNELS } from "@/lib/feed";

export interface ChannelSelectorProps {
  selected: string;
  onSelect: (channelId: string) => void;
  /** When false, renders a compact horizontal scroller (used in the player). */
  variant?: "bar" | "grid";
  /** Override the default channel list (e.g. for TMDb mode). */
  channels?: ChannelDefinition[];
}

export default function ChannelSelector({
  selected,
  onSelect,
  variant = "bar",
  channels = VISIBLE_CHANNELS,
}: ChannelSelectorProps) {
  if (variant === "grid") {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {channels.map((channel) => {
          const isActive = channel.id === selected;
          return (
            <button
              key={channel.id}
              type="button"
              onClick={() => onSelect(channel.id)}
              className={[
                "rounded-2xl border p-4 text-left transition",
                isActive
                  ? "border-accent bg-accent-soft"
                  : "border-lobby-border bg-lobby-surface hover:border-white/30",
              ].join(" ")}
            >
              <span className="block text-base font-bold">{channel.name}</span>
              <span className="mt-1 block text-xs text-white/50">
                {channel.description}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="no-scrollbar touch-scroll flex gap-2 overflow-x-auto px-1 py-1">
      {channels.map((channel) => {
        const isActive = channel.id === selected;
        return (
          <button
            key={channel.id}
            type="button"
            onClick={() => onSelect(channel.id)}
            className={[
              "whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition",
              isActive
                ? "bg-accent text-accent-contrast"
                : "bg-lobby-surface/80 text-white/70 hover:bg-lobby-surface hover:text-white",
            ].join(" ")}
          >
            {channel.name}
          </button>
        );
      })}
    </div>
  );
}
