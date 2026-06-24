"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Wordmark from "@/components/Wordmark";
import type {
  CurationListItem,
  CurationStatus,
  CurationUpdateInput,
} from "@/types/content";

const STATUS_TABS: { value: CurationStatus | "all"; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "candidate", label: "候補" },
  { value: "approved", label: "承認済み" },
  { value: "needs_review", label: "要レビュー" },
  { value: "draft", label: "下書き" },
  { value: "rejected", label: "却下" },
];

const STATUS_COLORS: Record<CurationStatus, string> = {
  draft: "bg-white/10 text-white/60",
  candidate: "bg-blue-500/20 text-blue-300",
  approved: "bg-green-500/20 text-green-300",
  rejected: "bg-red-500/20 text-red-300",
  needs_review: "bg-yellow-500/20 text-yellow-300",
};

interface EditingState {
  id: number;
  title: string;
  overview: string;
  shortCopy: string;
  qualityScore: number;
  curationStatus: CurationStatus;
  tags: string;
}

type StatusCounts = Record<string, number>;

const ADMIN_SECRET_KEY = "trailerflow.adminSecret";

export default function CurationPage() {
  const [items, setItems] = useState<CurationListItem[]>([]);
  const [counts, setCounts] = useState<StatusCounts>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<CurationStatus | "all">("all");
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  // Admin secret kept only in this browser's localStorage; sent as a Bearer
  // token so the protected API can be used from the (unauthenticated) UI page.
  const [adminSecret, setAdminSecret] = useState<string>("");
  const [needsSecret, setNeedsSecret] = useState(false);

  useEffect(() => {
    try {
      setAdminSecret(localStorage.getItem(ADMIN_SECRET_KEY) ?? "");
    } catch {
      // ignore
    }
  }, []);

  const authHeaders = useCallback(
    (extra: Record<string, string> = {}): Record<string, string> =>
      adminSecret
        ? { ...extra, Authorization: `Bearer ${adminSecret}` }
        : extra,
    [adminSecret],
  );

  const fetchList = useCallback(
    async (status?: CurationStatus | "all") => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "100" });
        if (status && status !== "all") params.set("status", status);
        const res = await fetch(`/api/admin/curation?${params}`, {
          cache: "no-store",
          headers: authHeaders(),
        });
        if (res.status === 401) {
          setNeedsSecret(true);
          setItems([]);
          setCounts({});
          return;
        }
        if (!res.ok) throw new Error(`${res.status}`);
        setNeedsSecret(false);
        const data = (await res.json()) as {
          items: CurationListItem[];
          counts?: StatusCounts;
        };
        setItems(data.items);
        if (data.counts) setCounts(data.counts);
      } catch (err) {
        console.error("Failed to load curation list", err);
      } finally {
        setLoading(false);
      }
    },
    [authHeaders],
  );

  useEffect(() => {
    fetchList(activeTab);
  }, [activeTab, fetchList]);

  const handleUnlock = (secret: string) => {
    const trimmed = secret.trim();
    setAdminSecret(trimmed);
    try {
      localStorage.setItem(ADMIN_SECRET_KEY, trimmed);
    } catch {
      // ignore
    }
    setNeedsSecret(false);
    // Re-fetch happens via fetchList dependency on authHeaders/adminSecret.
  };

  const handleTabChange = (tab: CurationStatus | "all") => {
    setActiveTab(tab);
    setEditing(null);
    setPreviewKey(null);
  };

  const openEdit = (item: CurationListItem) => {
    setEditing({
      id: item.id,
      title: item.title,
      overview: "",
      shortCopy: item.shortCopy ?? "",
      qualityScore: item.qualityScore,
      curationStatus: item.curationStatus,
      tags: item.tags.join(", "),
    });
    setPreviewKey(item.primaryVideoKey);
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const payload: CurationUpdateInput & { id: number } = {
        id: editing.id,
        title: editing.title,
        shortCopy: editing.shortCopy || undefined,
        curationStatus: editing.curationStatus,
        qualityScore: editing.qualityScore,
        tags: editing.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      };
      if (editing.overview) payload.overview = editing.overview;

      const res = await fetch("/api/admin/curation", {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setEditing(null);
      setPreviewKey(null);
      await fetchList(activeTab);
    } catch (err) {
      console.error("Failed to save", err);
      alert("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleQuickStatus = async (
    id: number,
    status: CurationStatus,
  ) => {
    try {
      await fetch("/api/admin/curation", {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id, curationStatus: status }),
      });
      await fetchList(activeTab);
    } catch (err) {
      console.error("Quick status change failed", err);
    }
  };

  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-6xl px-5 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Wordmark />
          <span className="rounded bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
            Admin
          </span>
        </div>
        <Link href="/" className="text-sm text-white/60 hover:text-white">
          ← 再生に戻る
        </Link>
      </header>

      <h1 className="text-2xl font-bold">キュレーション管理</h1>
      <p className="mt-1 text-sm text-white/50">
        予告編コンテンツの承認・編集・品質管理
      </p>

      {/* Secret unlock (only when ADMIN_SECRET protects the API) */}
      {needsSecret ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const input = new FormData(e.currentTarget).get("secret");
            handleUnlock(typeof input === "string" ? input : "");
          }}
          className="mt-6 rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-5"
        >
          <p className="text-sm font-bold text-yellow-200">
            この API は ADMIN_SECRET で保護されています
          </p>
          <p className="mt-1 text-xs text-white/50">
            管理シークレットを入力するとこのブラウザに保存され、以降の操作に使われます。
          </p>
          <div className="mt-3 flex gap-2">
            <input
              type="password"
              name="secret"
              autoComplete="off"
              placeholder="ADMIN_SECRET"
              className="flex-1 rounded-lg border border-lobby-border bg-lobby-bg px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-accent-contrast hover:brightness-110"
            >
              アンロック
            </button>
          </div>
        </form>
      ) : null}

      {/* Summary stats */}
      {(() => {
        const BETA_TARGET = 50;
        const approved = counts.approved ?? 0;
        const needsReview = counts.needs_review ?? 0;
        const pct = Math.min(100, Math.round((approved / BETA_TARGET) * 100));
        const metTarget = approved >= BETA_TARGET;
        return (
          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {/* Hero: live / public count */}
            <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-5 lg:col-span-2">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-green-300/80">
                    公開中（approved）
                  </p>
                  <p className="mt-1 flex items-baseline gap-2">
                    <span className="text-5xl font-bold tabular-nums text-green-300">
                      {approved}
                    </span>
                    <span className="text-sm text-white/50">
                      / 公開β目安 {BETA_TARGET} 本
                    </span>
                  </p>
                </div>
                <span
                  className={[
                    "shrink-0 rounded-full px-3 py-1 text-xs font-bold",
                    metTarget
                      ? "bg-green-500/20 text-green-200"
                      : "bg-yellow-500/20 text-yellow-200",
                  ].join(" ")}
                >
                  {metTarget ? "目安達成" : `あと ${BETA_TARGET - approved} 本`}
                </span>
              </div>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-green-400 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {/* Attention: needs_review */}
            <div
              className={[
                "rounded-2xl border p-5",
                needsReview > 0
                  ? "border-yellow-500/40 bg-yellow-500/10"
                  : "border-lobby-border bg-lobby-surface/60",
              ].join(" ")}
            >
              <p className="text-xs font-medium uppercase tracking-wider text-yellow-300/80">
                要レビュー（needs_review）
              </p>
              <p className="mt-1 text-5xl font-bold tabular-nums text-yellow-300">
                {needsReview}
              </p>
              <p className="mt-1 text-xs text-white/50">
                {needsReview > 0
                  ? "埋め込み・サムネを確認して承認/却下へ"
                  : "確認待ちはありません"}
              </p>
            </div>

            {/* Secondary statuses */}
            <div className="grid grid-cols-3 gap-3 lg:col-span-3">
              {(
                [
                  ["candidate", "候補", "text-blue-300"],
                  ["draft", "下書き", "text-white/70"],
                  ["rejected", "却下", "text-red-300"],
                ] as const
              ).map(([key, label, color]) => (
                <div
                  key={key}
                  className="rounded-xl border border-lobby-border bg-lobby-surface/60 px-3 py-3"
                >
                  <div className={`text-2xl font-bold tabular-nums ${color}`}>
                    {counts[key] ?? 0}
                  </div>
                  <div className="mt-0.5 text-[11px] text-white/50">{label}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Status tabs */}
      <div className="no-scrollbar touch-scroll mt-6 flex gap-2 overflow-x-auto">
        {STATUS_TABS.map((tab) => {
          const count = counts[tab.value];
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => handleTabChange(tab.value)}
              className={[
                "flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition",
                activeTab === tab.value
                  ? "bg-accent text-accent-contrast"
                  : "bg-lobby-surface text-white/60 hover:text-white",
              ].join(" ")}
            >
              {tab.label}
              {count !== undefined ? (
                <span
                  className={[
                    "rounded-full px-1.5 text-[11px] tabular-nums",
                    activeTab === tab.value
                      ? "bg-black/20 text-accent-contrast"
                      : "bg-white/10 text-white/60",
                  ].join(" ")}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex gap-6">
        {/* List */}
        <div className="min-w-0 flex-1">
          {loading ? (
            <p className="py-8 text-center text-white/40">読み込み中…</p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-white/50">
              この条件のコンテンツはありません。
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={[
                    "flex items-start gap-3 rounded-xl border p-3 transition",
                    editing?.id === item.id
                      ? "border-accent/60 bg-accent/5"
                      : "border-lobby-border bg-lobby-surface/60 hover:bg-lobby-surface",
                  ].join(" ")}
                >
                  {/* Thumbnail */}
                  <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-black">
                    {item.thumbnailUrl ? (
                      <Image
                        src={item.thumbnailUrl}
                        alt=""
                        fill
                        sizes="112px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="text-left font-bold leading-snug hover:text-accent"
                      >
                        {item.title}
                      </button>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLORS[item.curationStatus]}`}
                      >
                        {item.curationStatus}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/50">
                      <span>{item.source}</span>
                      <span>•</span>
                      <span>{item.contentType}</span>
                      {item.channelTitle ? (
                        <>
                          <span>•</span>
                          <span>{item.channelTitle}</span>
                        </>
                      ) : null}
                      <span>•</span>
                      <span>Q{item.qualityScore}</span>
                      {item.language ? (
                        <>
                          <span>•</span>
                          <span>{item.language}</span>
                        </>
                      ) : null}
                    </div>

                    {item.tags.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {item.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/50"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {/* Quick actions */}
                    <div className="mt-2 flex gap-1.5">
                      {item.curationStatus !== "approved" ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleQuickStatus(item.id, "approved")
                          }
                          className="rounded bg-green-600/30 px-2 py-0.5 text-[11px] text-green-300 hover:bg-green-600/50"
                        >
                          承認
                        </button>
                      ) : null}
                      {item.curationStatus !== "rejected" ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleQuickStatus(item.id, "rejected")
                          }
                          className="rounded bg-red-600/30 px-2 py-0.5 text-[11px] text-red-300 hover:bg-red-600/50"
                        >
                          却下
                        </button>
                      ) : null}
                      {item.curationStatus !== "needs_review" ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleQuickStatus(item.id, "needs_review")
                          }
                          className="rounded bg-yellow-600/30 px-2 py-0.5 text-[11px] text-yellow-300 hover:bg-yellow-600/50"
                        >
                          要レビュー
                        </button>
                      ) : null}
                      {item.primaryVideoKey ? (
                        <a
                          href={`https://www.youtube.com/watch?v=${item.primaryVideoKey}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded bg-white/5 px-2 py-0.5 text-[11px] text-white/60 hover:text-white"
                        >
                          YouTubeで開く
                        </a>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Edit / Preview panel */}
        {editing ? (
          <aside className="hidden w-96 shrink-0 lg:block">
            <div className="sticky top-6 space-y-4 rounded-2xl border border-lobby-border bg-lobby-surface p-5">
              <h2 className="text-lg font-bold">編集</h2>

              {/* YouTube preview */}
              {previewKey ? (
                <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
                  <iframe
                    src={`https://www.youtube.com/embed/${previewKey}`}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : null}

              {/* Thumbnail check */}
              {previewKey ? (
                <div className="flex gap-2">
                  <div className="relative h-12 w-20 overflow-hidden rounded bg-black">
                    <Image
                      src={`https://img.youtube.com/vi/${previewKey}/maxresdefault.jpg`}
                      alt="maxres"
                      fill
                      sizes="80px"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <div className="relative h-12 w-20 overflow-hidden rounded bg-black">
                    <Image
                      src={`https://img.youtube.com/vi/${previewKey}/hqdefault.jpg`}
                      alt="hq"
                      fill
                      sizes="80px"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <p className="self-end text-[10px] text-white/40">
                    maxres / hqdefault
                  </p>
                </div>
              ) : null}

              {/* Fields */}
              <label className="block text-xs text-white/50">
                タイトル
                <input
                  type="text"
                  value={editing.title}
                  onChange={(e) =>
                    setEditing({ ...editing, title: e.target.value })
                  }
                  className="mt-1 block w-full rounded-lg border border-lobby-border bg-lobby-bg px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
                />
              </label>

              <label className="block text-xs text-white/50">
                短いコピー
                <input
                  type="text"
                  value={editing.shortCopy}
                  onChange={(e) =>
                    setEditing({ ...editing, shortCopy: e.target.value })
                  }
                  className="mt-1 block w-full rounded-lg border border-lobby-border bg-lobby-bg px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
                />
              </label>

              <label className="block text-xs text-white/50">
                概要
                <textarea
                  value={editing.overview}
                  onChange={(e) =>
                    setEditing({ ...editing, overview: e.target.value })
                  }
                  rows={3}
                  className="mt-1 block w-full rounded-lg border border-lobby-border bg-lobby-bg px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
                />
              </label>

              <label className="block text-xs text-white/50">
                タグ (カンマ区切り)
                <input
                  type="text"
                  value={editing.tags}
                  onChange={(e) =>
                    setEditing({ ...editing, tags: e.target.value })
                  }
                  className="mt-1 block w-full rounded-lg border border-lobby-border bg-lobby-bg px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
                />
              </label>

              <div className="flex gap-3">
                <label className="block flex-1 text-xs text-white/50">
                  品質スコア (0–100)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editing.qualityScore}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        qualityScore: Math.min(
                          100,
                          Math.max(0, Number(e.target.value) || 0),
                        ),
                      })
                    }
                    className="mt-1 block w-full rounded-lg border border-lobby-border bg-lobby-bg px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
                  />
                </label>

                <label className="block flex-1 text-xs text-white/50">
                  ステータス
                  <select
                    value={editing.curationStatus}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        curationStatus: e.target.value as CurationStatus,
                      })
                    }
                    className="mt-1 block w-full rounded-lg border border-lobby-border bg-lobby-bg px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
                  >
                    <option value="draft">draft</option>
                    <option value="candidate">candidate</option>
                    <option value="approved">approved</option>
                    <option value="rejected">rejected</option>
                    <option value="needs_review">needs_review</option>
                  </select>
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-accent-contrast transition hover:brightness-110 disabled:opacity-50"
                >
                  {saving ? "保存中…" : "保存"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setPreviewKey(null);
                  }}
                  className="rounded-lg bg-lobby-bg px-4 py-2 text-sm text-white/60 hover:text-white"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </main>
  );
}
