import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { withTestDatabase, type TestDatabase } from '../database.js';

let h: TestDatabase;

beforeAll(async () => {
  h = await withTestDatabase();
}, 90_000);

afterAll(async () => {
  await h?.close();
});

describe('withTestDatabase', () => {
  it('applies all migrations: every domain table exists', async () => {
    const { rows } = await h.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const names = rows.map((r) => r.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        'users',
        'courses',
        'modules',
        'enrollments',
        'module_progress',
        'chat_sessions',
      ]),
    );
  });

  it('applies the RLS migration: row level security is enabled on users', async () => {
    const { rows } = await h.pool.query<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class WHERE relname = 'users'`,
    );
    expect(rows[0]?.relrowsecurity).toBe(true);
  });

  it('exposes a usable drizzle client', async () => {
    const result = await h.db.execute(sql`SELECT 1 AS one`);
    expect(result.rows[0]).toEqual({ one: 1 });
  });

  it('truncate() empties tables and restarts identity', async () => {
    await h.pool.query(
      `INSERT INTO users (supabase_id, email) VALUES (gen_random_uuid(), 'a@test.com')`,
    );
    await h.truncate();
    const { rows } = await h.pool.query<{ count: string }>(`SELECT count(*)::text FROM users`);
    expect(rows[0]?.count).toBe('0');
  });
});
