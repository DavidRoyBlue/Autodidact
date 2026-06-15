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

// dev-db-init.sql creates the vector/uuid extensions and the Supabase auth.* stubs
// that the RLS migrations (0003/0004) reference. Without it, those migrations fail
// to compile — which is why the original inline harness ran only 0001.
// Paths resolve from this file's dir in both the vitest (src/) and built (dist/) contexts:
//   src/database.ts  -> ../../../docker/dev-db-init.sql  and  ../../db/migrations
const DEV_DB_INIT = join(__dirname, '../../../docker/dev-db-init.sql');
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
    await pool.query(readFileSync(DEV_DB_INIT, 'utf-8'));

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
