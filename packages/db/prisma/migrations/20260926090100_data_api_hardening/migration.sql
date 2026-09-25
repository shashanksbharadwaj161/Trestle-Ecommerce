-- Defence in depth for Supabase (no-op on plain Postgres).
--
-- Trestle's tables live in their own schema (DATABASE_URL ?schema=trestle), which the Supabase
-- Data API does not expose unless someone adds it under Settings → API → Exposed schemas.
-- In case it ever is exposed, this migration:
--   1. enables row level security on every table in the current schema with NO policies, so the
--      anon / authenticated roles (which are subject to RLS) can read or write nothing;
--   2. revokes all privileges on the schema and its tables from anon and authenticated.
-- The Prisma role owns these tables, so RLS does not apply to it.
-- Only touches the schema this migration runs in; never touches Supabase-managed schemas.

DO $$
DECLARE
  t record;
  s text := current_schema();
BEGIN
  IF s IN ('public', 'auth', 'storage', 'extensions', 'graphql', 'graphql_public', 'realtime', 'supabase_functions', 'vault') THEN
    -- running in a shared schema (e.g. local dev on public): still enable RLS on our own tables,
    -- but never revoke schema-wide privileges from a schema we do not own.
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = s AND tablename <> '_prisma_migrations' LOOP
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', s, t.tablename);
    END LOOP;
  ELSE
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = s LOOP
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', s, t.tablename);
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON SCHEMA %I FROM anon', s);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM anon', s);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM anon', s);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON TABLES FROM anon', s);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON SCHEMA %I FROM authenticated', s);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM authenticated', s);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM authenticated', s);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON TABLES FROM authenticated', s);
    END IF;
  END IF;
END $$;
