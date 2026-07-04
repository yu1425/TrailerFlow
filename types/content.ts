/** Content types the curation system can manage. */
export type ContentType =
  | "movie"
  | "anime"
  | "game"
  | "tv"
  | "travel"
  | "restaurant";

export type CurationStatus =
  | "draft"
  | "candidate"
  | "approved"
  | "rejected"
  | "needs_review";

export type ContentSource = "manual" | "youtube" | "tmdb" | "wikidata";

/** Mirrors the `contents` table. */
export interface ContentRow {
  id: number;
  content_type: ContentType;
  title: string;
  original_title: string | null;
  overview: string | null;
  short_copy: string | null;
  release_date: string | null;
  language: string | null;
  country: string | null;
  official_url: string | null;
  thumbnail_url: string | null;
  poster_url: string | null;
  backdrop_url: string | null;
  quality_score: number;
  source: ContentSource;
  curation_status: CurationStatus;
  firehose_visible: boolean | null;
  auto_collected: boolean | null;
  auto_score: number | null;
  warning_flags: string[] | null;
  source_type: string | null;
  discovery_reason: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Mirrors the `content_trailers` table. */
export interface ContentTrailerRow {
  id: number;
  content_id: number;
  youtube_video_key: string;
  title: string | null;
  channel_title: string | null;
  channel_id: string | null;
  language: string | null;
  type: string | null;
  official: boolean | null;
  official_level: string | null;
  embed_status: string | null;
  source_url: string | null;
  duration_seconds: number | null;
  curator_note: string | null;
  firehose_visible: boolean | null;
  auto_collected: boolean | null;
  auto_score: number | null;
  warning_flags: string[] | null;
  source_type: string | null;
  discovery_reason: string | null;
  published_at: string | null;
  thumbnail_url: string | null;
  is_active: boolean;
  created_at: string;
}

/** Mirrors the `official_channels` table. */
export interface OfficialChannelRow {
  id: string;
  channel_title: string;
  description: string | null;
  content_type: ContentType;
  language: string;
  is_active: boolean;
  created_at: string;
}

/** Content with its related trailers and tags, as returned by Supabase joins. */
export interface ContentWithRelations extends ContentRow {
  content_trailers: ContentTrailerRow[];
  content_tags: { tag: string }[];
}

/** Admin list item shape for the curation UI. */
export interface CurationListItem {
  id: number;
  contentType: ContentType;
  title: string;
  shortCopy: string | null;
  curationStatus: CurationStatus;
  source: ContentSource;
  qualityScore: number;
  language: string | null;
  thumbnailUrl: string | null;
  trailerCount: number;
  primaryVideoKey: string | null;
  channelTitle: string | null;
  durationSeconds: number | null;
  trailerType: string | null;
  officialLevel: string | null;
  embedStatus: string | null;
  sourceUrl: string | null;
  curatorNote: string | null;
  firehoseVisible: boolean;
  autoCollected: boolean;
  autoScore: number | null;
  warningFlags: string[];
  sourceType: string | null;
  discoveryReason: string | null;
  tags: string[];
  createdAt: string;
}

/** Shape for updating curation fields via admin API. */
export interface CurationUpdateInput {
  title?: string;
  overview?: string;
  shortCopy?: string;
  curationStatus?: CurationStatus;
  qualityScore?: number;
  tags?: string[];
  contentType?: ContentType;
}

export type DataMode = "manual" | "tmdb" | "mixed" | "firehose";

export type DiscoverySourceType =
  | "tmdb_list"
  | "tmdb_genre"
  | "youtube_channel"
  | "youtube_search"
  | "rating_list"
  | "festival_awards"
  | "celebrity_recommendations"
  | "manual_seed";

export type DiscoveryJobStatus = "pending" | "running" | "completed" | "failed";

export interface DiscoverySourceRow {
  id: number;
  source_type: DiscoverySourceType;
  name: string;
  query: string | null;
  params: Record<string, unknown> | null;
  enabled: boolean;
  priority: number;
  last_run_at: string | null;
  next_cursor: string | null;
  total_collected_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiscoveryJobRow {
  id: number;
  source_id: number | null;
  status: DiscoveryJobStatus;
  started_at: string | null;
  finished_at: string | null;
  collected_count: number;
  duplicate_count: number;
  skipped_count: number;
  error_count: number;
  error_message: string | null;
  cursor_before: string | null;
  cursor_after: string | null;
  created_at: string;
}
