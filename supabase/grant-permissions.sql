-- Grant permissions for the new curation tables.
-- Run this in the Supabase SQL Editor if you get "permission denied" errors.
--
-- The service_role key bypasses RLS, but still needs PostgreSQL-level
-- table permissions (GRANT). Supabase auto-grants to `postgres` and
-- `authenticated`/`anon` for tables created via migrations, but tables
-- created manually in the SQL Editor may need explicit grants.

-- Grant full access to service_role (used by our API routes and scripts).
GRANT ALL ON TABLE contents TO service_role;
GRANT ALL ON TABLE content_trailers TO service_role;
GRANT ALL ON TABLE content_tags TO service_role;
GRANT ALL ON TABLE official_channels TO service_role;

-- Grant usage on sequences so INSERT with bigserial works.
GRANT USAGE, SELECT ON SEQUENCE contents_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE content_trailers_id_seq TO service_role;

-- Also grant to the existing tables in case they have the same issue.
GRANT ALL ON TABLE movies TO service_role;
GRANT ALL ON TABLE genres TO service_role;
GRANT ALL ON TABLE movie_genres TO service_role;
GRANT ALL ON TABLE trailers TO service_role;
GRANT ALL ON TABLE user_events TO service_role;
GRANT ALL ON TABLE anonymous_profiles TO service_role;
GRANT ALL ON TABLE channels TO service_role;
GRANT USAGE, SELECT ON SEQUENCE movies_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE trailers_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE user_events_id_seq TO service_role;

-- Disable RLS on curation tables (MVP — no user-facing writes to these).
-- service_role bypasses RLS anyway, but this prevents surprises if you
-- ever query these tables with the anon key during debugging.
ALTER TABLE contents DISABLE ROW LEVEL SECURITY;
ALTER TABLE content_trailers DISABLE ROW LEVEL SECURITY;
ALTER TABLE content_tags DISABLE ROW LEVEL SECURITY;
ALTER TABLE official_channels DISABLE ROW LEVEL SECURITY;

-- Verify: list tables in public schema
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
