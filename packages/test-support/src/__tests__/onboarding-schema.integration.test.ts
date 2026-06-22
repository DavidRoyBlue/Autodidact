import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { withTestDatabase, type TestDatabase } from '../database.js';
import { courses, users, eq } from '@autodidact/db';

let h: TestDatabase;
beforeAll(async () => { h = await withTestDatabase(); }, 90_000);
afterAll(async () => { await h?.close(); });
beforeEach(async () => { await h.truncate(); });

describe('onboarding schema (migration 0011)', () => {
  it('allows exactly one is_onboarding course (partial unique index)', async () => {
    await h.db.insert(courses).values({
      topic: 'Welcome', slug: 'welcome-1', title: 'Welcome', description: 'd',
      status: 'ready', isOnboarding: true,
    });
    await expect(
      h.db.insert(courses).values({
        topic: 'Welcome', slug: 'welcome-2', title: 'Welcome 2', description: 'd',
        status: 'ready', isOnboarding: true,
      }),
    ).rejects.toThrow();
  });

  it('permits many non-onboarding courses (partial index ignores false)', async () => {
    await h.db.insert(courses).values({ topic: 'a', slug: 'a', title: 'a', description: 'd', status: 'ready' });
    await h.db.insert(courses).values({ topic: 'b', slug: 'b', title: 'b', description: 'd', status: 'ready' });
    const rows = await h.db.select({ id: courses.id }).from(courses);
    expect(rows.length).toBe(2);
  });

  it('users.onboarded_at defaults to null and is settable', async () => {
    const [u] = await h.db
      .insert(users)
      .values({ supabaseId: crypto.randomUUID() })
      .returning({ id: users.id, onboardedAt: users.onboardedAt });
    expect(u?.onboardedAt).toBeNull();
    await h.db.update(users).set({ onboardedAt: new Date() }).where(eq(users.id, u!.id));
    const [after] = await h.db
      .select({ onboardedAt: users.onboardedAt })
      .from(users)
      .where(eq(users.id, u!.id));
    expect(after?.onboardedAt).not.toBeNull();
  });
});
