import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { withTestDatabase, type TestDatabase } from '@autodidact/test-support';
import { makeMockLogger } from '@autodidact/config/test-utils';

// ────────────────────────────────────────────────────────────────────────────
// Redirect @autodidact/db → harness DB (so the processor's getDb() hits the
// Testcontainer, not the real DATABASE_URL). Mirrors embedding.integration.test.
// ────────────────────────────────────────────────────────────────────────────

let dbHarness: TestDatabase;

vi.mock('@autodidact/db', async () => {
  const { eq, and, sql, or, inArray, desc, asc, gt, lt, gte, lte } = await import('drizzle-orm');
  const schema = await import('../../../../packages/db/src/schema/index.js');
  return {
    ...schema,
    eq, and, sql, or, inArray, desc, asc, gt, lt, gte, lte,
    getDb: () => dbHarness.db,
    supabaseAdmin: null,
  };
});

import { processStaleAnonymousCleanup } from '../processors/stale-anonymous-cleanup.processor.js';

const logger = makeMockLogger() as never;

beforeAll(async () => {
  dbHarness = await withTestDatabase();
}, 90_000);

afterAll(async () => {
  await dbHarness?.close();
});

beforeEach(async () => {
  await dbHarness.truncate();
  await dbHarness.pool.query('delete from auth.users');
});

/**
 * Insert an auth.users row (the Plan A provisioning trigger creates the matching
 * public.users row), then backdate public.users.created_at to simulate age.
 */
async function seedAuthUser(isAnon: boolean, ageDays: number, email: string | null): Promise<string> {
  const { rows } = await dbHarness.pool.query<{ id: string }>(
    `insert into auth.users (email, is_anonymous) values ($1, $2) returning id`,
    [email, isAnon],
  );
  const id = rows[0]!.id;
  await dbHarness.pool.query(
    `update public.users set created_at = now() - ($1 || ' days')::interval where id = $2`,
    [String(ageDays), id],
  );
  return id;
}

describe('processStaleAnonymousCleanup', () => {
  it('deletes only anonymous users older than the retention window, cascading dependents', async () => {
    const oldAnon = await seedAuthUser(true, 120, null);
    const recentAnon = await seedAuthUser(true, 10, null);
    const oldReal = await seedAuthUser(false, 200, 'real@test.dev');

    // A dependent enrollment that must cascade-delete with oldAnon (FK ON DELETE
    // CASCADE from migration 0006). NOT NULL course columns: topic/slug/title/description.
    const course = await dbHarness.pool.query<{ id: string }>(
      `insert into courses (topic, slug, title, description) values ('t', 't-slug', 'T', 'd') returning id`,
    );
    await dbHarness.pool.query(`insert into enrollments (user_id, course_id) values ($1, $2)`, [
      oldAnon,
      course.rows[0]!.id,
    ]);

    const result = await processStaleAnonymousCleanup({ retentionDays: 90 }, { logger });

    expect(result.deleted).toBe(1);
    // oldAnon gone from both tables; its enrollment cascade-deleted
    expect((await dbHarness.pool.query(`select 1 from public.users where id=$1`, [oldAnon])).rowCount).toBe(0);
    expect((await dbHarness.pool.query(`select 1 from auth.users where id=$1`, [oldAnon])).rowCount).toBe(0);
    expect((await dbHarness.pool.query(`select 1 from enrollments where user_id=$1`, [oldAnon])).rowCount).toBe(0);
    // recent anon + real user retained
    expect((await dbHarness.pool.query(`select 1 from public.users where id=$1`, [recentAnon])).rowCount).toBe(1);
    expect((await dbHarness.pool.query(`select 1 from public.users where id=$1`, [oldReal])).rowCount).toBe(1);
  });

  it('defaults the retention window to 90 days when omitted', async () => {
    const oldAnon = await seedAuthUser(true, 100, null);
    const result = await processStaleAnonymousCleanup({}, { logger });
    expect(result.deleted).toBe(1);
    expect((await dbHarness.pool.query(`select 1 from auth.users where id=$1`, [oldAnon])).rowCount).toBe(0);
  });

  it('returns { deleted: 0 } when nothing is stale', async () => {
    await seedAuthUser(true, 10, null);
    const result = await processStaleAnonymousCleanup({ retentionDays: 90 }, { logger });
    expect(result.deleted).toBe(0);
  });
});
