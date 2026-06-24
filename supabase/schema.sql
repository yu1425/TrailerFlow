-- TrailerFlow database schema
-- Apply with: supabase db push   or   psql "$DATABASE_URL" -f supabase/schema.sql

-- Required for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- movies
-- ---------------------------------------------------------------------------
create table if not exists movies (
  id                bigserial primary key,
  tmdb_id           integer unique not null,
  imdb_id           text,
  title             text not null,
  original_title    text,
  overview          text,
  release_date      date,
  runtime           integer,
  poster_path       text,
  backdrop_path     text,
  popularity        numeric,
  vote_average      numeric,
  vote_count        integer,
  original_language text,
  adult             boolean default false,
  status            text,
  homepage          text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists idx_movies_tmdb_id      on movies (tmdb_id);
create index if not exists idx_movies_popularity   on movies (popularity desc);
create index if not exists idx_movies_release_date on movies (release_date desc);

-- ---------------------------------------------------------------------------
-- genres
-- ---------------------------------------------------------------------------
create table if not exists genres (
  id   integer primary key,
  name text not null
);

-- ---------------------------------------------------------------------------
-- movie_genres
-- ---------------------------------------------------------------------------
create table if not exists movie_genres (
  movie_id bigint references movies(id) on delete cascade,
  genre_id integer references genres(id) on delete cascade,
  primary key (movie_id, genre_id)
);

create index if not exists idx_movie_genres_genre_id on movie_genres (genre_id);

-- ---------------------------------------------------------------------------
-- trailers
-- ---------------------------------------------------------------------------
create table if not exists trailers (
  id           bigserial primary key,
  movie_id     bigint references movies(id) on delete cascade,
  site         text not null,
  video_key    text not null,
  name         text,
  type         text,
  official     boolean,
  published_at timestamptz,
  language     text,
  country      text,
  is_active    boolean default true,
  created_at   timestamptz default now(),
  unique (site, video_key)
);

create index if not exists idx_trailers_movie_id  on trailers (movie_id);
create index if not exists idx_trailers_site       on trailers (site);
create index if not exists idx_trailers_is_active  on trailers (is_active);

-- ---------------------------------------------------------------------------
-- user_events
-- ---------------------------------------------------------------------------
create table if not exists user_events (
  id                bigserial primary key,
  anonymous_user_id uuid not null,
  movie_id          bigint references movies(id) on delete set null,
  trailer_id        bigint references trailers(id) on delete set null,
  event_type        text not null,
  channel           text,
  watch_seconds     integer,
  video_duration    integer,
  created_at        timestamptz default now()
);

create index if not exists idx_user_events_anon_user on user_events (anonymous_user_id);
create index if not exists idx_user_events_created_at on user_events (created_at desc);

-- ---------------------------------------------------------------------------
-- anonymous_profiles
-- ---------------------------------------------------------------------------
create table if not exists anonymous_profiles (
  anonymous_user_id   uuid primary key,
  genre_weights       jsonb default '{}'::jsonb,
  preferred_languages jsonb default '[]'::jsonb,
  watched_movie_ids   jsonb default '[]'::jsonb,
  liked_movie_ids     jsonb default '[]'::jsonb,
  skipped_movie_ids   jsonb default '[]'::jsonb,
  watchlist_movie_ids jsonb default '[]'::jsonb,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- channels
-- ---------------------------------------------------------------------------
create table if not exists channels (
  id          text primary key,
  name        text not null,
  description text,
  config      jsonb not null,
  is_active   boolean default true,
  sort_order  integer default 0
);

-- ===========================================================================
-- Manual Curation Mode
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- contents — curated content (replaces movies for public-facing feed)
-- ---------------------------------------------------------------------------
create table if not exists contents (
  id               bigserial primary key,
  content_type     text not null default 'movie',
  title            text not null,
  original_title   text,
  overview         text,
  short_copy       text,
  release_date     date,
  language         text,
  country          text,
  official_url     text,
  thumbnail_url    text,
  poster_url       text,
  backdrop_url     text,
  quality_score    integer default 50,
  source           text not null default 'manual',
  curation_status  text not null default 'draft',
  is_active        boolean default true,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),

  constraint chk_content_type check (
    content_type in ('movie','anime','game','tv','travel','restaurant')
  ),
  constraint chk_source check (
    source in ('manual','youtube','tmdb','wikidata')
  ),
  constraint chk_curation_status check (
    curation_status in ('draft','candidate','approved','rejected','needs_review')
  )
);

create index if not exists idx_contents_curation_status on contents (curation_status);
create index if not exists idx_contents_content_type    on contents (content_type);
create index if not exists idx_contents_quality_score   on contents (quality_score desc);
create index if not exists idx_contents_source          on contents (source);
create index if not exists idx_contents_is_active       on contents (is_active);
create index if not exists idx_contents_release_date    on contents (release_date desc);

-- ---------------------------------------------------------------------------
-- content_trailers — YouTube trailers linked to curated contents
-- ---------------------------------------------------------------------------
create table if not exists content_trailers (
  id                bigserial primary key,
  content_id        bigint references contents(id) on delete cascade,
  youtube_video_key text not null,
  title             text,
  channel_title     text,
  channel_id        text,
  language          text,
  type              text default 'Trailer',
  official          boolean default true,
  published_at      timestamptz,
  thumbnail_url     text,
  is_active         boolean default true,
  created_at        timestamptz default now(),
  unique (youtube_video_key)
);

create index if not exists idx_content_trailers_content_id on content_trailers (content_id);
create index if not exists idx_content_trailers_is_active  on content_trailers (is_active);

-- ---------------------------------------------------------------------------
-- content_tags — free-form tags on curated contents
-- ---------------------------------------------------------------------------
create table if not exists content_tags (
  content_id bigint references contents(id) on delete cascade,
  tag        text not null,
  primary key (content_id, tag)
);

create index if not exists idx_content_tags_tag on content_tags (tag);

-- ---------------------------------------------------------------------------
-- official_channels — known YouTube channels for candidate import
-- ---------------------------------------------------------------------------
create table if not exists official_channels (
  id             text primary key,
  channel_title  text not null,
  description    text,
  content_type   text not null default 'movie',
  language       text default 'ja',
  is_active      boolean default true,
  created_at     timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Seed channels
-- The app also has these defaults hard-coded in lib/feed.ts so the feed works
-- even before this seed runs, but storing them here lets you tune config live.
-- ---------------------------------------------------------------------------
insert into channels (id, name, description, config, sort_order) values
  ('lobby',     'ロビー',     'いま注目の予告編をバランスよく',       '{"sort":"balanced"}',                              0),
  ('new',       '新作予告',   'これから公開される最新の予告編',       '{"minReleaseYear":"recent","sort":"release"}',     1),
  ('popular',   '人気',       '話題作の予告編を中心に',               '{"sort":"popularity"}',                            2),
  ('japanese',  '日本映画',   '日本語作品の予告編',                   '{"language":"ja"}',                                3),
  ('action',    'アクション', 'アクション映画の予告編',               '{"genres":[28]}',                                  4),
  ('romance',   '恋愛',       'ロマンス映画の予告編',                 '{"genres":[10749]}',                               5),
  ('horror',    'ホラー',     'ホラー映画の予告編',                   '{"genres":[27]}',                                  6),
  ('animation', 'アニメ',     'アニメーション作品の予告編',           '{"genres":[16]}',                                  7),
  ('random',    'ランダム',   '気分を変えてランダムに',               '{"sort":"random"}',                                8)
on conflict (id) do update set
  name        = excluded.name,
  description = excluded.description,
  config      = excluded.config,
  sort_order  = excluded.sort_order;
