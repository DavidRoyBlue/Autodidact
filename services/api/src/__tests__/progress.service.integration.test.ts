import 'reflect-metadata';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  withTestDatabase,
  type TestDatabase,
  seedUser,
  seedCourse,
  seedModules,
  seedEnrollment,
  seedModuleProgress,
} from '@autodidact/test-support';

// Harness is assigned in beforeAll; the @autodidact/db mock defers getDb() to call time.
let harness: TestDatabase;

vi.mock('@autodidact/db', async () => {
  const { eq, and, sql, or, inArray, desc, asc, gt, lt, gte, lte } = await import('drizzle-orm');
  const schema = await import('../../../../packages/db/src/schema/index.js');
  return {
    ...schema,
    eq, and, sql, or, inArray, desc, asc, gt, lt, gte, lte,
    getDb: () => harness.db,
    supabaseAdmin: null,
  };
});

import { moduleProgress, enrollments, eq, and } from '@autodidact/db';
import { ProgressService } from '../modules/progress/progress.service.js';

beforeAll(async () => {
  harness = await withTestDatabase();
}, 90_000);

afterAll(async () => {
  await harness?.close();
});

// ────────────────────────────────────────────────────────────────────────────

describe('ProgressService.completeModule()', () => {
  let service: InstanceType<typeof ProgressService>;
  let userId: string;
  let courseId: string;

  beforeEach(async () => {
    await harness.truncate();
    service = new ProgressService();
    const user = await seedUser(harness.db);
    const course = await seedCourse(harness.db, user.id);
    userId = user.id;
    courseId = course.id;
  });

  it('marks the completed module status="completed" with the given score', async () => {
    const mods = await seedModules(harness.db, courseId, 3);
    await seedEnrollment(harness.db, userId, courseId);
    await seedModuleProgress(harness.db, userId, courseId, mods);
    const mod0 = mods[0]!;

    await service.completeModule(userId, mod0.id, courseId, 85);

    const [progress] = await harness.db
      .select({ status: moduleProgress.status, completionScore: moduleProgress.completionScore })
      .from(moduleProgress)
      .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.moduleId, mod0.id)));

    expect(progress?.status).toBe('completed');
    expect(progress?.completionScore).toBe(85);
  });

  it('unlocks exactly the next module (position+1) after completion', async () => {
    const mods = await seedModules(harness.db, courseId, 3);
    await seedEnrollment(harness.db, userId, courseId);
    await seedModuleProgress(harness.db, userId, courseId, mods);
    const mod0 = mods[0]!;
    const mod1 = mods[1]!;
    const mod2 = mods[2]!;

    await service.completeModule(userId, mod0.id, courseId, 90);

    const [p1] = await harness.db
      .select({ status: moduleProgress.status })
      .from(moduleProgress)
      .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.moduleId, mod1.id)));
    const [p2] = await harness.db
      .select({ status: moduleProgress.status })
      .from(moduleProgress)
      .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.moduleId, mod2.id)));

    expect(p1?.status).toBe('available');
    expect(p2?.status).toBe('locked');
  });

  it('sets enrollment.completedAt when all modules are completed', async () => {
    const mods = await seedModules(harness.db, courseId, 2);
    const enroll = await seedEnrollment(harness.db, userId, courseId);
    await seedModuleProgress(harness.db, userId, courseId, mods);

    // Complete mod 0 first
    await service.completeModule(userId, mods[0]!.id, courseId, 80);
    // Manually mark mod 1 as completed (to simulate second completion)
    await harness.db
      .update(moduleProgress)
      .set({ status: 'completed', completionScore: 75 })
      .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.moduleId, mods[1]!.id)));
    // Now complete — this triggers the "all done" check
    await service.completeModule(userId, mods[0]!.id, courseId, 80);

    const [enrolRow] = await harness.db
      .select({ completedAt: enrollments.completedAt })
      .from(enrollments)
      .where(eq(enrollments.id, enroll.id));

    expect(enrolRow?.completedAt).not.toBeNull();
  });

  it('does NOT set enrollment.completedAt when some modules remain incomplete', async () => {
    const mods = await seedModules(harness.db, courseId, 3);
    const enroll = await seedEnrollment(harness.db, userId, courseId);
    await seedModuleProgress(harness.db, userId, courseId, mods);

    // Only complete the first module
    await service.completeModule(userId, mods[0]!.id, courseId, 80);

    const [enrolRow] = await harness.db
      .select({ completedAt: enrollments.completedAt })
      .from(enrollments)
      .where(eq(enrollments.id, enroll.id));

    expect(enrolRow?.completedAt).toBeNull();
  });
});

describe('ProgressService.markModuleStarted()', () => {
  let service: InstanceType<typeof ProgressService>;
  let userId: string;
  let courseId: string;

  beforeEach(async () => {
    await harness.truncate();
    service = new ProgressService();
    const user = await seedUser(harness.db);
    const course = await seedCourse(harness.db, user.id);
    userId = user.id;
    courseId = course.id;
  });

  it('updates status to "in_progress" when module is "available"', async () => {
    const mods = await seedModules(harness.db, courseId, 1);
    await seedEnrollment(harness.db, userId, courseId);
    await seedModuleProgress(harness.db, userId, courseId, mods);

    await service.markModuleStarted(userId, mods[0]!.id);

    const [progress] = await harness.db
      .select({ status: moduleProgress.status })
      .from(moduleProgress)
      .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.moduleId, mods[0]!.id)));

    expect(progress?.status).toBe('in_progress');
  });

  it('does NOT update a "locked" module to "in_progress"', async () => {
    const mods = await seedModules(harness.db, courseId, 2);
    await seedEnrollment(harness.db, userId, courseId);
    await seedModuleProgress(harness.db, userId, courseId, mods);

    // mods[1] has position=1, so it starts as 'locked'
    await service.markModuleStarted(userId, mods[1]!.id);

    const [progress] = await harness.db
      .select({ status: moduleProgress.status })
      .from(moduleProgress)
      .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.moduleId, mods[1]!.id)));

    expect(progress?.status).toBe('locked');
  });
});
