import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@autodidact/db';
import type { DB } from '@autodidact/db';
import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// ESM has no __dirname; reconstruct it from this module's URL so the paths below
// resolve from this file's directory in both vitest (src/) and built (dist/) contexts.
const __dirname = dirname(fileURLToPath(import.meta.url));

// Tests run against a plain pgvector Postgres (Testcontainers) that has no Supabase
// auth schema, so we create the vector/uuid extensions and the auth.* stubs that the
// RLS migrations (0003/0004) reference — without them those migrations fail to compile.
// (The local dev stack uses real Supabase GoTrue and needs none of this; the retired
// docker/dev-db-init.sql once held these stubs — they now live here, with their sole
// remaining consumer. See packages/test-support/CLAUDE.md.)
const DEV_DB_INIT_SQL = `
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Supabase predefined roles. The real stack/prod ships these; the plain
-- Testcontainers Postgres does not. Migrations that GRANT/REVOKE on anon /
-- authenticated / service_role (e.g. 0008's REVOKE, and Plan C's Data API
-- lockdown) reference them by name and fail with "role does not exist" without
-- these. NOLOGIN, no privileges — just enough for the grant DDL to resolve.
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT '00000000-0000-0000-0000-000000000000'::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT 'authenticated'::text $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE
  AS $$ SELECT '{}'::jsonb $$;

-- Stub of GoTrue's auth.users for tests (the real table exists only in the
-- Supabase stack / prod). Columns mirror what handle_new_user / the sync trigger
-- read. The real GoTrue manages this table in the live stack; here it lets the
-- trigger install and be exercised by inserting/updating rows directly.
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  is_anonymous boolean NOT NULL DEFAULT false,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Stub of GoTrue's auth.identities for tests. Columns mirror what
-- handle_identity_linked (0011) reads. Lets the trigger install and be
-- exercised by inserting identity rows directly.
CREATE TABLE IF NOT EXISTS auth.identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  identity_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider text NOT NULL DEFAULT 'email'
);
`;

// Resolves from this file's dir in both vitest (src/) and built (dist/) contexts:
//   src/database.ts -> ../../db/migrations
const MIGRATIONS_DIR = join(__dirname, '../../db/migrations');

// Tables truncated by truncate(); ordered child-before-parent (CASCADE makes the
// order redundant but keeps intent clear). Keep in sync with packages/db/src/schema
// as new tables are added.
const TRUNCATE_TABLES = [
  'module_progress',
  'chat_sessions',
  'enrollments',
  'modules',
  'courses',
  'users',
];

export interface TestDatabase {
  /** Drizzle client bound to the test container (schema-aware, like production). */
  db: DB;
  /** Raw pg pool, for setup/assertions that bypass Drizzle. */
  pool: Pool;
  /** The running Postgres container. */
  container: StartedPostgreSqlContainer;
  /** TRUNCATE all domain tables. Call in beforeEach. */
  truncate: () => Promise<void>;
  /** Stop the pool and container. Call in afterAll. */
  close: () => Promise<void>;
}

/**
 * Boot a pgvector Postgres container, apply the dev auth stubs + every migration,
 * and return a Drizzle client plus lifecycle helpers. Connects as superuser, so
 * RLS policies are created and exercised but do not block seeding (matching dev).
 */
export async function withTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
    .withDatabase('autodidact_test')
    .withUsername('postgres')
    .withPassword('postgres')
    .start();

  const pool = new Pool({ connectionString: container.getConnectionUri() });

  try {
    // Schema-aware client so consumers get the relational query API (db.query.*),
    // matching the production client in @autodidact/db.
    const db = drizzle(pool, { schema }) as unknown as DB;

    // 1. extensions + auth.* stubs
    await pool.query(DEV_DB_INIT_SQL);

    // 2. all .sql migrations in lexical order (0001 → 0004)
    const migrationFiles = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of migrationFiles) {
      await pool.query(readFileSync(join(MIGRATIONS_DIR, file), 'utf-8'));
    }

    const truncate = async () => {
      await pool.query(`TRUNCATE ${TRUNCATE_TABLES.join(', ')} CASCADE`);
    };

    const close = async () => {
      await pool.end();
      await container.stop();
    };

    return { db, pool, container, truncate, close };
  } catch (err) {
    // Setup failed after the container started — never leak the container or pool.
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
    throw err;
  }
}
