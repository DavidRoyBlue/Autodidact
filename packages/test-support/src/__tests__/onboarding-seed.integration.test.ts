import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { withTestDatabase, type TestDatabase } from '../database.js';
import { seedOnboardingCourse, courses, modules, eq } from '@autodidact/db';

let h: TestDatabase;
beforeAll(async () => { h = await withTestDatabase(); }, 90_000);
afterAll(async () => { await h?.close(); });
beforeEach(async () => { await h.truncate(); });

describe('seedOnboardingCourse', () => {
  it('creates exactly one onboarding course with its modules', async () => {
    const { courseId } = await seedOnboardingCourse(h.db);
    const rows = await h.db
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.isOnboarding, true));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(courseId);
    const mods = await h.db.select({ id: modules.id }).from(modules).where(eq(modules.courseId, courseId));
    expect(mods.length).toBeGreaterThanOrEqual(1);
  });

  it('is idempotent — running twice yields one course and stable module ids', async () => {
    const first = await seedOnboardingCourse(h.db);
    const before = await h.db
      .select({ id: modules.id, position: modules.position })
      .from(modules)
      .where(eq(modules.courseId, first.courseId))
      .orderBy(modules.position);

    const second = await seedOnboardingCourse(h.db);
    expect(second.courseId).toBe(first.courseId);

    const courseRows = await h.db.select({ id: courses.id }).from(courses).where(eq(courses.isOnboarding, true));
    expect(courseRows).toHaveLength(1);

    const after = await h.db
      .select({ id: modules.id, position: modules.position })
      .from(modules)
      .where(eq(modules.courseId, first.courseId))
      .orderBy(modules.position);
    expect(after.map((m) => m.id)).toEqual(before.map((m) => m.id)); // ids preserved (module_progress FK has no cascade)
  });
});
