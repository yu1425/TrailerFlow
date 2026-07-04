"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Wordmark from "@/components/Wordmark";
import type {
  DiscoveryJobRow,
  DiscoverySourceRow,
  DiscoverySourceType,
} from "@/types/content";

const ADMIN_SECRET_KEY = "trailerflow.adminSecret";

const SOURCE_TYPES: DiscoverySourceType[] = [
  "tmdb_list",
  "tmdb_genre",
  "youtube_channel",
  "youtube_search",
  "rating_list",
  "festival_awards",
  "celebrity_recommendations",
  "manual_seed",
];

interface SourceFormState {
  sourceType: DiscoverySourceType;
  name: string;
  query: string;
  params: string;
  priority: number;
  notes: string;
}

function formatDate(value: string | null): string {
  if (!value) return "未実行";
  return new Date(value).toLocaleString("ja-JP");
}

function formatParams(params: Record<string, unknown> | null): string {
  if (!params || Object.keys(params).length === 0) return "{}";
  return JSON.stringify(params);
}

export default function DiscoveryAdminPage() {
  const [sources, setSources] = useState<DiscoverySourceRow[]>([]);
  const [jobs, setJobs] = useState<DiscoveryJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [adminSecret, setAdminSecret] = useState("");
  const [needsSecret, setNeedsSecret] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<SourceFormState>({
    sourceType: "tmdb_list",
    name: "",
    query: "popular",
    params: '{ "language": "ja-JP", "region": "JP" }',
    priority: 50,
    notes: "",
  });

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

  const fetchSources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/discovery/sources", {
        cache: "no-store",
        headers: authHeaders(),
      });
      if (res.status === 401) {
        setNeedsSecret(true);
        setSources([]);
        setJobs([]);
        return;
      }
      if (!res.ok) throw new Error(`${res.status}`);
      setNeedsSecret(false);
      const data = (await res.json()) as {
        sources: DiscoverySourceRow[];
        jobs: DiscoveryJobRow[];
      };
      setSources(data.sources);
      setJobs(data.jobs);
    } catch (err) {
      console.error("Failed to load discovery sources", err);
      setMessage("Discovery Source の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void fetchSources();
  }, [fetchSources]);

  const handleUnlock = (secret: string) => {
    const trimmed = secret.trim();
    setAdminSecret(trimmed);
    try {
      localStorage.setItem(ADMIN_SECRET_KEY, trimmed);
    } catch {
      // ignore
    }
    setNeedsSecret(false);
  };

  const handleSourceTypeChange = (sourceType: DiscoverySourceType) => {
    const defaults: Record<DiscoverySourceType, Pick<SourceFormState, "query" | "params">> = {
      tmdb_list: {
        query: "popular",
        params: '{ "language": "ja-JP", "region": "JP" }',
      },
      tmdb_genre: {
        query: "878",
        params: '{ "language": "ja-JP", "region": "JP" }',
      },
      youtube_channel: {
        query: "",
        params: '{ "content_type": "movie", "language": "ja", "batch_size": 25 }',
      },
      youtube_search: {
        query: "映画 予告",
        params: '{ "content_type": "movie", "language": "ja", "batch_size": 25 }',
      },
      rating_list: { query: "", params: "{}" },
      festival_awards: { query: "", params: "{}" },
      celebrity_recommendations: { query: "", params: "{}" },
      manual_seed: { query: "", params: "{}" },
    };
    setForm((prev) => ({
      ...prev,
      sourceType,
      query: defaults[sourceType].query,
      params: defaults[sourceType].params,
    }));
  };

  const handleCreate = async () => {
    setSaving(true);
    setMessage(null);
    try {
      let parsedParams: Record<string, unknown>;
      try {
        parsedParams = JSON.parse(form.params || "{}") as Record<string, unknown>;
      } catch {
        throw new Error("params は JSON object で入力してください");
      }

      const res = await fetch("/api/admin/discovery/sources", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          source_type: form.sourceType,
          name: form.name,
          query: form.query,
          params: parsedParams,
          priority: form.priority,
          notes: form.notes,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (res.status === 401) {
        setNeedsSecret(true);
        throw new Error("ADMIN_SECRET が必要です");
      }
      if (!res.ok) throw new Error(data.error ?? `${res.status}`);
      setMessage("Discovery Source を追加しました");
      setForm((prev) => ({ ...prev, name: "", notes: "" }));
      await fetchSources();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Source追加に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async (sourceId: number) => {
    setRunningId(sourceId);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/discovery/sources/${sourceId}/run`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = (await res.json()) as {
        error?: string;
        collectedCount?: number;
        duplicateCount?: number;
        skippedCount?: number;
        errorCount?: number;
      };
      if (res.status === 401) {
        setNeedsSecret(true);
        throw new Error("ADMIN_SECRET が必要です");
      }
      if (!res.ok) throw new Error(data.error ?? `${res.status}`);
      setMessage(
        `実行完了: collected ${data.collectedCount ?? 0}, duplicate ${data.duplicateCount ?? 0}, skipped ${data.skippedCount ?? 0}, failed ${data.errorCount ?? 0}`,
      );
      await fetchSources();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Source実行に失敗しました");
    } finally {
      setRunningId(null);
    }
  };

  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-6xl px-5 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Wordmark />
          <span className="rounded bg-orange-500/20 px-2 py-0.5 text-xs font-medium text-orange-300">
            Firehose Admin
          </span>
        </div>
        <nav className="flex items-center gap-4 text-sm text-white/60">
          <Link href="/admin/curation" className="hover:text-white">
            キュレーション
          </Link>
          <Link href="/" className="hover:text-white">
            再生に戻る
          </Link>
        </nav>
      </header>

      <h1 className="text-2xl font-bold">Discovery Source 管理</h1>
      <p className="mt-1 text-sm text-white/50">
        テーマ単発ではなく、巡回する収集ソースを登録して予告編棚を増やします。
      </p>

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

      <section className="mt-6 rounded-2xl border border-lobby-border bg-lobby-surface/70 p-5">
        <h2 className="text-lg font-bold">Sourceを追加</h2>
        <form
          className="mt-4 grid gap-3 lg:grid-cols-12"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
        >
          <label className="block text-xs text-white/50 lg:col-span-3">
            source_type
            <select
              value={form.sourceType}
              onChange={(e) =>
                handleSourceTypeChange(e.target.value as DiscoverySourceType)
              }
              className="mt-1 block w-full rounded-lg border border-lobby-border bg-lobby-bg px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
            >
              {SOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-white/50 lg:col-span-4">
            name
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-lobby-border bg-lobby-bg px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
            />
          </label>
          <label className="block text-xs text-white/50 lg:col-span-4">
            query
            <input
              value={form.query}
              onChange={(e) => setForm({ ...form, query: e.target.value })}
              placeholder="popular / 878 / channelId / search words"
              className="mt-1 block w-full rounded-lg border border-lobby-border bg-lobby-bg px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
            />
          </label>
          <label className="block text-xs text-white/50 lg:col-span-1">
            priority
            <input
              type="number"
              min={0}
              max={100}
              value={form.priority}
              onChange={(e) =>
                setForm({ ...form, priority: Number(e.target.value) || 0 })
              }
              className="mt-1 block w-full rounded-lg border border-lobby-border bg-lobby-bg px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
            />
          </label>
          <label className="block text-xs text-white/50 lg:col-span-8">
            params JSON
            <input
              value={form.params}
              onChange={(e) => setForm({ ...form, params: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-lobby-border bg-lobby-bg px-3 py-2 font-mono text-xs text-white focus:border-accent focus:outline-none"
            />
          </label>
          <label className="block text-xs text-white/50 lg:col-span-4">
            notes
            <input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-lobby-border bg-lobby-bg px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
            />
          </label>
          <div className="lg:col-span-12">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-accent-contrast transition hover:brightness-110 disabled:opacity-50"
            >
              {saving ? "追加中…" : "Sourceを追加"}
            </button>
          </div>
        </form>
        {message ? (
          <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-sm text-white/70">
            {message}
          </p>
        ) : null}
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-bold">Sources</h2>
        {loading ? (
          <p className="py-8 text-center text-white/40">読み込み中…</p>
        ) : sources.length === 0 ? (
          <p className="py-8 text-center text-white/50">
            Discovery Source はまだありません。
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sources.map((source) => (
              <li
                key={source.id}
                className="rounded-xl border border-lobby-border bg-lobby-surface/60 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold">{source.name}</h3>
                      <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-white/60">
                        {source.source_type}
                      </span>
                      <span className="rounded bg-orange-500/10 px-2 py-0.5 text-[11px] text-orange-200">
                        priority {source.priority}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/50">
                      <span>query: {source.query || "none"}</span>
                      <span>cursor: {source.next_cursor || "none"}</span>
                      <span>last: {formatDate(source.last_run_at)}</span>
                      <span>collected: {source.total_collected_count}</span>
                    </div>
                    <div className="mt-2 break-all rounded bg-black/20 px-2 py-1 font-mono text-[11px] text-white/45">
                      {formatParams(source.params)}
                    </div>
                    {source.notes ? (
                      <p className="mt-2 text-xs text-white/50">{source.notes}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={runningId === source.id}
                    onClick={() => void handleRun(source.id)}
                    className="shrink-0 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-50"
                  >
                    {runningId === source.id ? "実行中…" : "手動実行"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold">Recent Jobs</h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-lobby-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/5 text-white/40">
              <tr>
                <th className="px-3 py-2">status</th>
                <th className="px-3 py-2">source</th>
                <th className="px-3 py-2">collected</th>
                <th className="px-3 py-2">duplicate</th>
                <th className="px-3 py-2">skipped</th>
                <th className="px-3 py-2">failed</th>
                <th className="px-3 py-2">finished</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-lobby-border">
                  <td className="px-3 py-2">{job.status}</td>
                  <td className="px-3 py-2">{job.source_id ?? "none"}</td>
                  <td className="px-3 py-2 tabular-nums">{job.collected_count}</td>
                  <td className="px-3 py-2 tabular-nums">{job.duplicate_count}</td>
                  <td className="px-3 py-2 tabular-nums">{job.skipped_count}</td>
                  <td className="px-3 py-2 tabular-nums">{job.error_count}</td>
                  <td className="px-3 py-2">{formatDate(job.finished_at)}</td>
                </tr>
              ))}
              {jobs.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-white/40" colSpan={7}>
                    job はまだありません。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
