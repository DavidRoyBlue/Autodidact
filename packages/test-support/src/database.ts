import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// dev-db-init.sql creates the vector/uuid extensions and the Supabase auth.* stubs
// that the RLS migrations (0003/0004) reference. Without it, those migrations fail
// to compile — which is why the original inline harness ran only 0001.
const DEV_DB_INIT = join(__dirname, '../../../docker/dev-db-init.sql');
const MIGRATIONS_DIR = join(__dirname, '../../db/migrations');

// Tables truncated by truncate(); ordered child-before-parent for CASCADE safety.
// Keep in sync with packages/db/src/schema as new tables are added.
const TRUNCATE_TABLES = [
  'module_progress',
  'chat_sessions',
  'enrollments',
  'modules',
  'courses',
  'users',
];

export interface TestDatabase {
  /** Drizzle client bound to the test container. */
  db: NodePgDatabase;
  /** Raw pg pool, for setup/assertions that bypass Drizzle. */
  pool: Pool;
  /** The running Postgres container. */
  container: StartedPostgreSqlContainer;
  /** TRUNCATE all domain tables and restart identities. Call in beforeEach. */
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
  const db = drizzle(pool);

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
    await pool.query(`TRUNCATE ${TRUNCATE_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
  };

  const close = async () => {
    await pool.end();
    await container.stop();
  };

  return { db, pool, container, truncate, close };
}
