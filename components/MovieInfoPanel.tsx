"use client";

import Image from "next/image";
import type { FeedMovie } from "@/types/movie";
import type { FeedTrailer as Trailer } from "@/types/trailer";

export interface MovieInfoPanelProps {
  movie: FeedMovie | null;
  trailer: Trailer | null;
  open: boolean;
  onClose: () => void;
  onWatchlist: () => void;
  onLike: () => void;
  isWatchlisted: boolean;
  /**
   * When false, the desktop side panel renders an empty state instead of a
   * "loading…" placeholder. Keeps the lobby quiet before the first trailer
   * starts playing.
   */
  hasStarted?: boolean;
}

function releaseYear(releaseDate: string | null): string | null {
  if (!releaseDate) return null;
  const year = releaseDate.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
}

/** Human label for the trailer's language, e.g. "日本語予告" / "英語予告". */
function trailerLanguageLabel(language: string | null): string | null {
  if (!language) return null;
  if (language.startsWith("ja")) return "日本語予告";
  if (language.startsWith("en")) return "英語予告";
  return "その他言語の予告";
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  movie: "映画",
  anime: "アニメ",
  game: "ゲーム",
  tv: "TV",
  travel: "旅行",
  restaurant: "グルメ",
};

const LANGUAGE_LABELS: Record<string, string> = {
  ja: "日本語作品",
  en: "英語作品",
};

function PanelBody({
  movie,
  trailer,
  onWatchlist,
  onLike,
  isWatchlisted,
}: {
  movie: FeedMovie;
  trailer: Trailer | null;
  onWatchlist: () => void;
  onLike: () => void;
  isWatchlisted: boolean;
}) {
  const year = releaseYear(movie.releaseDate);
  const langLabel = trailerLanguageLabel(trailer?.language ?? null);
  const typeLabel = movie.contentType
    ? CONTENT_TYPE_LABELS[movie.contentType] ?? movie.contentType
    : null;
  const contentLangLabel = movie.language
    ? LANGUAGE_LABELS[movie.language] ?? movie.language
    : null;
  const youtubeUrl = trailer?.videoKey
    ? `https://www.youtube.com/watch?v=${trailer.videoKey}`
    : null;

  return (
    <div className="flex flex-col gap-4">
      {movie.posterUrl ? (
        <div className="relative mx-auto aspect-[2/3] w-40 overflow-hidden rounded-xl border border-lobby-border sm:w-48">
          <Image
            src={movie.posterUrl}
            alt={`${movie.title} のポスター`}
            fill
            sizes="192px"
            className="object-cover"
            unoptimized
          />
        </div>
      ) : null}

      {/* Type + meta chips */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {typeLabel ? (
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-medium text-accent">
            {typeLabel}
          </span>
        ) : null}
        {contentLangLabel ? (
          <span className="rounded-full border border-lobby-border px-2.5 py-0.5 text-white/60">
            {contentLangLabel}
          </span>
        ) : null}
        {year ? <span className="text-white/50">{year}年</span> : null}
      </div>

      <div>
        <h2 className="text-xl font-bold leading-snug">{movie.title}</h2>
        {movie.shortCopy ? (
          <p className="mt-2 text-base font-medium leading-relaxed text-accent">
            {movie.shortCopy}
          </p>
        ) : null}
      </div>

      {/* In-panel quick actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onWatchlist}
          className={[
            "flex-1 rounded-xl px-3 py-2.5 text-sm font-bold transition active:scale-95",
            isWatchlisted
              ? "bg-accent-soft text-accent"
              : "bg-accent text-accent-contrast hover:brightness-110",
          ].join(" ")}
        >
          {isWatchlisted ? "★ 登録済み" : "☆ 観たい"}
        </button>
        <button
          type="button"
          onClick={onLike}
          className="flex-1 rounded-xl bg-lobby-bg px-3 py-2.5 text-sm font-bold text-white/80 transition hover:text-white active:scale-95"
        >
          ♥ この系統もっと
        </button>
      </div>

      {movie.genres.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {movie.genres.map((g) => (
            <span
              key={g}
              className="rounded-full border border-lobby-border bg-lobby-surface px-3 py-1 text-xs text-white/70"
            >
              {g}
            </span>
          ))}
        </div>
      ) : null}

      {movie.overview ? (
        <p className="text-sm leading-relaxed text-white/80">{movie.overview}</p>
      ) : (
        <p className="text-sm text-white/40">あらすじは登録されていません。</p>
      )}

      {langLabel || trailer?.name ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/40">
          {langLabel ? (
            <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-medium text-accent">
              {langLabel}
            </span>
          ) : null}
          {trailer?.name ? <span>予告編: {trailer.name}</span> : null}
        </div>
      ) : null}

      {/* External links */}
      <div className="flex flex-wrap gap-3 text-sm">
        {youtubeUrl ? (
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-lobby-border px-3 py-1.5 text-white/70 transition hover:border-white/30 hover:text-white"
          >
            ▶ YouTubeで開く
          </a>
        ) : null}
        {movie.officialUrl ? (
          <a
            href={movie.officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-lobby-border px-3 py-1.5 text-white/70 transition hover:border-white/30 hover:text-white"
          >
            公式サイト
          </a>
        ) : null}
      </div>

      <p className="mt-2 border-t border-lobby-border pt-3 text-[11px] leading-relaxed text-white/40">
        予告編動画は YouTube の埋め込みプレイヤーで再生され、権利は各権利者に帰属します。
      </p>
    </div>
  );
}

/**
 * Movie details. On desktop it renders as a static side panel; on mobile it
 * slides up from the bottom as a sheet. The `open` prop drives the mobile sheet
 * visibility — desktop always shows the current movie.
 */
export default function MovieInfoPanel({
  movie,
  trailer,
  open,
  onClose,
  onWatchlist,
  onLike,
  isWatchlisted,
  hasStarted = true,
}: MovieInfoPanelProps) {
  // Mobile sheet is rendered only when the user has actually opened it. Before
  // that, an `inset-0` wrapper covered the screen (pointer-events-none, but
  // still produced extra layout work and made some screen readers announce an
  // empty dialog). Skipping the wrapper entirely until `open` keeps the mobile
  // viewport clean while no one is interacting with the sheet.
  const renderMobileSheet = open;

  return (
    <>
      {/* Desktop: persistent right-side panel */}
      <aside className="no-scrollbar hidden h-full w-[360px] shrink-0 overflow-y-auto border-l border-lobby-border bg-lobby-surface/40 p-6 lg:block">
        {movie ? (
          <PanelBody
            movie={movie}
            trailer={trailer}
            onWatchlist={onWatchlist}
            onLike={onLike}
            isWatchlisted={isWatchlisted}
          />
        ) : hasStarted ? (
          <p className="text-sm text-white/40">予告編を読み込み中…</p>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-accent/80">
              Now Showing
            </p>
            <p className="text-sm text-white/40">
              再生がはじまると、ここに作品情報が表示されます。
            </p>
          </div>
        )}
      </aside>

      {/* Mobile: bottom sheet — only mounted while open. */}
      {renderMobileSheet ? (
        <div
          className="fixed inset-0 z-40 pointer-events-auto lg:hidden"
          aria-hidden={!open}
        >
          <div
            onClick={onClose}
            className="absolute inset-0 bg-black/60 transition-opacity opacity-100"
          />
          <div className="no-scrollbar absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-lobby-border bg-lobby-surface p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] animate-slide-up">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/20" />
            <button
              type="button"
              onClick={onClose}
              className="mb-4 text-sm text-white/50 hover:text-white"
            >
              閉じる
            </button>
            {movie ? (
              <PanelBody
                movie={movie}
                trailer={trailer}
                onWatchlist={onWatchlist}
                onLike={onLike}
                isWatchlisted={isWatchlisted}
              />
            ) : (
              <p className="text-sm text-white/40">予告編を読み込み中…</p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
