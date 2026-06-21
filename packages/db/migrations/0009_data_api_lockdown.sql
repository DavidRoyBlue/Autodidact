-- 0009_data_api_lockdown.sql
-- Spec 2 (production-auth) Phase 2 / D3 — close the PostgREST Data API for the publishable key.
-- Backend services connect as `postgres` (BYPASSRLS); revoked grants + RLS protect only the
-- client surface. service_role grants are intentionally retained (admin client).

-- 1. Revoke privileges on all CURRENT public objects from the PostgREST roles.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- 2. Stop FUTURE objects (incl. runtime-created checkpoint tables) from being re-granted.
--    Root cause = postgres-owned pg_default_acl entry. Our app + LangGraph create tables as
--    postgres, so revoking postgres's default privileges (the implicit FOR ROLE) covers them.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- 3. Enable RLS on the Drizzle-owned table missed by 0003/0004 (no policy = deny-all;
--    the worker writes it as postgres/BYPASSRLS).
ALTER TABLE public.module_content_chunks ENABLE ROW LEVEL SECURITY;

-- 4. Enable RLS on the 4 LangGraph checkpoint tables IF they already exist (prod/warm DBs).
--    On a fresh DB they don't exist yet -> the agent checkpointer init() enables RLS after setup().
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['checkpoints','checkpoint_writes','checkpoint_blobs','checkpoint_migrations']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;
