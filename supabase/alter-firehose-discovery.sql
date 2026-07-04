-- Firehose / Discovery Source foundation.
-- Safe to re-run: columns, tables, and indexes are created only if missing.

alter table contents
  add column if not exists firehose_visible boolean default false,
  add column if not exists auto_collected boolean default false,
  add column if not exists auto_score integer,
  add column if not exists warning_flags jsonb default '[]'::jsonb,
  add column if not exists source_type text,
  add column if not exists discovery_reason text;

alter table content_trailers
  add column if not exists firehose_visible boolean default false,
  add column if not exists auto_collected boolean default false,
  add column if not exists auto_score integer,
  add column if not exists warning_flags jsonb default '[]'::jsonb,
  add column if not exists source_type text,
  add column if not exists discovery_reason text;

create index if not exists idx_contents_firehose_visible
  on contents (firehose_visible);
create index if not exists idx_contents_auto_collected
  on contents (auto_collected);
create index if not exists idx_contents_source_type
  on contents (source_type);
create index if not exists idx_content_trailers_firehose_visible
  on content_trailers (firehose_visible);

create table if not exists discovery_sources (
  id                    bigserial primary key,
  source_type           text not null,
  name                  text not null,
  query                 text,
  params                jsonb default '{}'::jsonb,
  enabled               boolean default true,
  priority              integer default 50,
  last_run_at           timestamptz,
  next_cursor           text,
  total_collected_count integer default 0,
  notes                 text,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),
  constraint chk_discovery_source_type check (
    source_type in (
      'tmdb_list',
      'tmdb_genre',
      'youtube_channel',
      'youtube_search',
      'rating_list',
      'festival_awards',
      'celebrity_recommendations',
      'manual_seed'
    )
  )
);

create index if not exists idx_discovery_sources_enabled
  on discovery_sources (enabled);
create index if not exists idx_discovery_sources_priority
  on discovery_sources (priority desc);
create index if not exists idx_discovery_sources_source_type
  on discovery_sources (source_type);

create table if not exists discovery_jobs (
  id              bigserial primary key,
  source_id       bigint references discovery_sources(id) on delete set null,
  status          text not null default 'pending',
  started_at      timestamptz,
  finished_at     timestamptz,
  collected_count integer default 0,
  duplicate_count integer default 0,
  skipped_count   integer default 0,
  error_count     integer default 0,
  error_message   text,
  cursor_before   text,
  cursor_after    text,
  created_at      timestamptz default now(),
  constraint chk_discovery_job_status check (
    status in ('pending','running','completed','failed')
  )
);

create index if not exists idx_discovery_jobs_source_id
  on discovery_jobs (source_id);
create index if not exists idx_discovery_jobs_created_at
  on discovery_jobs (created_at desc);
create index if not exists idx_discovery_jobs_status
  on discovery_jobs (status);
