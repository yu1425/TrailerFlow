-- Safely add curation metadata fields to an existing content_trailers table.
-- This is intentionally limited to the columns added for YouTube candidate
-- curation, and can be re-run without failing.

alter table content_trailers
  add column if not exists official_level text default 'unknown',
  add column if not exists embed_status text default 'unknown',
  add column if not exists source_url text,
  add column if not exists duration_seconds integer,
  add column if not exists curator_note text;

create index if not exists idx_content_trailers_duration_seconds
  on content_trailers (duration_seconds);
