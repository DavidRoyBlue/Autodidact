import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { withTestDatabase, type TestDatabase } from '../database.ts';
import { seedUser, seedCourse, seedModules, seedEnrollment, seedModuleProgress } from '../seed.ts';

let h: TestDatabase;

beforeAll(async () => {
  h = await withTestDatabase();
}, 90_000);

afterAll(async () => {
  await h?.close();
});

beforeEach(async () => {
  await h.truncate();
});

describe('seed factories', () => {
  it('seedUser inserts and returns an id', async () => {
    const user = await seedUser(h.db);
    expect(user.id).toMatch(/[0-9a-f-]{36}/);
  });

  it('seedCourse links to the generating user', async () => {
    const user = await seedUser(h.db);
    const course = await seedCourse(h.db, user.id);
    expect(course.id).toBeTruthy();
  });

  it('seedModules creates N modules with ascending positions', async () => {
    const user = await seedUser(h.db);
    const course = await seedCourse(h.db, user.id);
    const mods = await seedModules(h.db, course.id, 3);
    expect(mods.map((m) => m.position)).toEqual([0, 1, 2]);
  });

  it('seedModuleProgress unlocks only position 0', async () => {
    const user = await seedUser(h.db);
    const course = await seedCourse(h.db, user.id);
    const mods = await seedModules(h.db, course.id, 2);
    await seedEnrollment(h.db, user.id, course.id);
    const progress = await seedModuleProgress(h.db, user.id, course.id, mods);
    const byPos = Object.fromEntries(
      progress.map((p, i) => [mods[i]!.position, p.status]),
    );
    expect(byPos[0]).toBe('available');
    expect(byPos[1]).toBe('locked');
  });
});
