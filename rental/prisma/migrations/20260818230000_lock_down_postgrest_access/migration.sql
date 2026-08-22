-- Close the PostgREST door.
--
-- Supabase serves the `public` schema over a REST API at
-- <project>.supabase.co/rest/v1/, authenticated with the project's anon key.
-- That key is designed to be public. Out of the box the `anon` and
-- `authenticated` roles are granted SELECT and INSERT on every table Prisma
-- creates, and row-level security is off — so anyone holding the anon key can
-- read User password hashes, Guest contact details, AccessRecord door codes
-- and Payment rows, and write rows of their own.
--
-- This app never uses that API. Nothing here touches Supabase Auth or the
-- supabase-js client; every read and write goes through Prisma over a
-- server-side connection string, gated twice in application code. So the API
-- surface is pure liability and gets closed rather than policed.
--
-- Two layers, because either alone can be undone by accident:
--
--   1. RLS on with no policies. PostgREST connects as `anon` or
--      `authenticated` and is denied everything. Prisma connects as
--      `postgres`, which OWNS these tables, and a table owner bypasses RLS
--      unless FORCE ROW LEVEL SECURITY is set — which it is not. The
--      application is unaffected.
--
--   2. The grants themselves revoked, including the default privileges that
--      would otherwise be handed to future tables. If RLS is ever switched
--      off on a table again, there is still no privilege behind it.
--
-- `anon` and `authenticated` are Supabase's roles and do not exist on a plain
-- Postgres, so every reference to them is guarded. This migration is a no-op
-- on a local or CI database rather than a failure.

-- 1 ── row-level security on every table in the schema, including any added
--      later by a migration that forgets to think about this.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.oid::regclass AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t.tbl);
  END LOOP;
END $$;

-- 2 ── take the grants away as well.
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', role_name);
      EXECUTE format('REVOKE USAGE ON SCHEMA public FROM %I', role_name);

      -- Future tables. Prisma creates these as `postgres`, so the default
      -- privileges that matter are the ones postgres hands out.
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM %I',
        role_name
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I',
        role_name
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END $$;
