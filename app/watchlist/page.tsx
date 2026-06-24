"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Wordmark from "@/components/Wordmark";
import WatchlistButton from "@/components/WatchlistButton";
import { getOrCreateAnonymousUserId } from "@/lib/anonymousUser";
import { fetchWatchlist, removeFromWatchlist } from "@/lib/watchlist";
import type { FeedItem } from "@/types/trailer";

function releaseYear(date: string | null): string | null {
  if (!date) return null;
  const y = date.slice(0, 4);
  return /^\d{4}$/.test(y) ? y : null;
}

export default function WatchlistPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const id = getOrCreateAnonymousUserId();
    setUserId(id);
    let active = true;
    fetchWatchlist(id)
      .then((data) => {
        if (active) setItems(data);
      })
      .catch((err) => console.error("Failed to load watchlist", err))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleRemove = async (movieId: number) => {
    if (!userId) return;
    setItems((prev) => prev.filter((it) => it.movie.id !== movieId));
    try {
      await removeFromWatchlist(userId, movieId);
    } catch (err) {
      console.error("Failed to remove from watchlist", err);
    }
  };

  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-4xl px-5 py-8">
      <header className="mb-8 flex items-center justify-between">
        <Wordmark />
        <Link href="/" className="text-sm text-white/60 hover:text-white">
          ← 再生に戻る
        </Link>
      </header>

      <h1 className="text-2xl font-bold">観たいリスト</h1>
      <p className="mt-2 text-sm text-white/50">
        「観たい」した映画はここに集まります。
      </p>

      <div className="mt-8">
        {loading ? (
          <p className="text-white/40">読み込み中…</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-lobby-border bg-lobby-surface p-8 text-center">
            <p className="text-white/60">まだ何も登録されていません。</p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-full bg-accent px-6 py-2 text-sm font-bold text-accent-contrast"
            >
              予告編を浴びにいく
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {items.map((item) => {
              const year = releaseYear(item.movie.releaseDate);
              const hasTrailer = Boolean(item.trailer.videoKey);
              return (
                <li
                  key={item.movie.id}
                  className="flex gap-4 rounded-2xl border border-lobby-border bg-lobby-surface p-4"
                >
                  <div className="relative h-36 w-24 shrink-0 overflow-hidden rounded-lg bg-black">
                    {item.movie.posterUrl ? (
                      <Image
                        src={item.movie.posterUrl}
                        alt={`${item.movie.title} のポスター`}
                        fill
                        sizes="96px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <h2 className="font-bold leading-snug">
                      {item.movie.title}
                    </h2>
                    {year ? (
                      <span className="mt-0.5 text-xs text-white/40">
                        {year}年
                      </span>
                    ) : null}
                    {item.movie.genres.length > 0 ? (
                      <span className="mt-1 line-clamp-1 text-xs text-white/50">
                        {item.movie.genres.join(" / ")}
                      </span>
                    ) : null}

                    <div className="mt-auto flex items-center gap-2 pt-3">
                      {hasTrailer ? (
                        <a
                          href={`https://www.youtube.com/watch?v=${item.trailer.videoKey}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full bg-lobby-bg px-4 py-2 text-xs font-medium text-white/80 hover:text-white"
                        >
                          ▶ 予告編
                        </a>
                      ) : null}
                      <WatchlistButton
                        isWatchlisted
                        onToggle={() => handleRemove(item.movie.id)}
                        className="!px-3 !py-1.5 !text-xs"
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="mt-10 text-[11px] leading-relaxed text-white/30">
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </main>
  );
}
