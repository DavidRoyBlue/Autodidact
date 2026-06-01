import 'reflect-metadata';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { readFileSync } from 'fs';
import { join } from 'path';

// ────────────────────────────────────────────────────────────────────────────
// testDb is set in beforeAll; getDb() closure defers resolution until call time
// ────────────────────────────────────────────────────────────────────────────

let testDb: ReturnType<typeof drizzle>;

vi.mock('@autodidact/db', async () => {
  // Import SQL helpers from drizzle-orm directly to avoid loading supabase client
  const { eq, and, sql, or, inArray, desc, asc, gt, lt, gte, lte } = await import('drizzle-orm');
  // Import schema tables from source — these are pure column definitions (no side-effects)
  const schema = await import('../../../../packages/db/src/schema/index.js');
  return {
    ...schema,
    eq, and, sql, or, inArray, desc, asc, gt, lt, gte, lte,
    getDb: () => testDb,
    getSupabaseAdmin: () => null,
  };
});

import {
  users,
  courses,
  modules,
  enrollments,
  moduleProgress,
  eq,
  and,
} from '@autodidact/db';
import { ProgressService } from '../modules/progress/progress.service.js';

// ────────────────────────────────────────────────────────────────────────────

const MIGRATIONS_DIR = join(__dirname, '../../../../packages/db/migrations');

let container: StartedPostgreSqlContainer;
let pool: Pool;

beforeAll(async () => {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
    .withDatabase('autodidact_test')
    .withUsername('postgres')
    .withPassword('postgres')
    .start();

  pool = new Pool({ connectionString: container.getConnectionUri() });
  testDb = drizzle(pool);

  // Run only the schema migration (skip index and RLS migrations)
  const schemaSql = readFileSync(join(MIGRATIONS_DIR, '0001_initial.sql'), 'utf-8');
  await pool.query(schemaSql);
}, 90_000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

// ────────────────────────────────────────────────────────────────────────────
// Test helpers
// ────────────────────────────────────────────────────────────────────────────

async function truncateTables() {
  await pool.query(`
    TRUNCATE module_progress, chat_sessions, enrollments, modules, courses, users
    RESTART IDENTITY CASCADE
  `);
}

async function createUser() {
  const [user] = await testDb
    .insert(users)
    .values({ supabaseId: crypto.randomUUID(), email: `user-${crypto.randomUUID()}@test.com` })
    .returning({ id: users.id });
  if (!user) throw new Error('Failed to create test user');
  return user;
}

async function createCourse(userId: string) {
  const [course] = await testDb
    .insert(courses)
    .values({
      topic: 'Python',
      slug: `python-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Python Basics',
      description: 'Learn Python',
      difficulty: 'beginner',
      status: 'ready',
      generatedBy: userId,
    })
    .returning({ id: courses.id });
  if (!course) throw new Error('Failed to create test course');
  return course;
}

async function createModules(courseId: string, count: number) {
  const rows = Array.from({ length: count }, (_, i) => ({
    courseId,
    position: i,
    title: `Module ${i}`,
    description: `Description ${i}`,
    objectives: ['obj1'],
    contentOutline: [{ title: 'Section', points: ['point'] }],
    estimatedMinutes: 30,
  }));
  return testDb.insert(modules).values(rows).returning({ id: modules.id, position: modules.position });
}

async function createEnrollment(userId: string, courseId: string) {
  const [enrollment] = await testDb
    .insert(enrollments)
    .values({ userId, courseId })
    .returning({ id: enrollments.id });
  if (!enrollment) throw new Error('Failed to create enrollment');
  return enrollment;
}

async function createModuleProgress(
  userId: string,
  courseId: string,
  mods: Array<{ id: string; position: number }>,
) {
  const rows = mods.map((m) => ({
    userId,
    moduleId: m.id,
    courseId,
    status: (m.position === 0 ? 'available' : 'locked') as 'available' | 'locked',
  }));
  return testDb.insert(moduleProgress).values(rows).returning();
}

// ────────────────────────────────────────────────────────────────────────────

describe('ProgressService.completeModule()', () => {
  let service: InstanceType<typeof ProgressService>;
  let userId: string;
  let courseId: string;

  beforeEach(async () => {
    await truncateTables();
    service = new ProgressService();
    const user = await createUser();
    const course = await createCourse(user.id);
    userId = user.id;
    courseId = course.id;
  });

  it('marks the completed module status="completed" with the given score', async () => {
    const mods = await createModules(courseId, 3);
    await createEnrollment(userId, courseId);
    await createModuleProgress(userId, courseId, mods);
    const mod0 = mods[0]!;

    await service.completeModule(userId, mod0.id, courseId, 85);

    const [progress] = await testDb
      .select({ status: moduleProgress.status, completionScore: moduleProgress.completionScore })
      .from(moduleProgress)
      .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.moduleId, mod0.id)));

    expect(progress?.status).toBe('completed');
    expect(progress?.completionScore).toBe(85);
  });

  it('unlocks exactly the next module (position+1) after completion', async () => {
    const mods = await createModules(courseId, 3);
    await createEnrollment(userId, courseId);
    await createModuleProgress(userId, courseId, mods);
    const mod0 = mods[0]!;
    const mod1 = mods[1]!;
    const mod2 = mods[2]!;

    await service.completeModule(userId, mod0.id, courseId, 90);

    const [p1] = await testDb
      .select({ status: moduleProgress.status })
      .from(moduleProgress)
      .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.moduleId, mod1.id)));
    const [p2] = await testDb
      .select({ status: moduleProgress.status })
      .from(moduleProgress)
      .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.moduleId, mod2.id)));

    expect(p1?.status).toBe('available');
    expect(p2?.status).toBe('locked');
  });

  it('sets enrollment.completedAt when all modules are completed', async () => {
    const mods = await createModules(courseId, 2);
    const enroll = await createEnrollment(userId, courseId);
    await createModuleProgress(userId, courseId, mods);

    // Complete mod 0 first
    await service.completeModule(userId, mods[0]!.id, courseId, 80);
    // Manually mark mod 1 as completed (to simulate second completion)
    await testDb
      .update(moduleProgress)
      .set({ status: 'completed', completionScore: 75 })
      .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.moduleId, mods[1]!.id)));
    // Now complete — this triggers the "all done" check
    await service.completeModule(userId, mods[0]!.id, courseId, 80);

    const [enrolRow] = await testDb
      .select({ completedAt: enrollments.completedAt })
      .from(enrollments)
      .where(eq(enrollments.id, enroll.id));

    expect(enrolRow?.completedAt).not.toBeNull();
  });

  it('does NOT set enrollment.completedAt when some modules remain incomplete', async () => {
    const mods = await createModules(courseId, 3);
    const enroll = await createEnrollment(userId, courseId);
    await createModuleProgress(userId, courseId, mods);

    // Only complete the first module
    await service.completeModule(userId, mods[0]!.id, courseId, 80);

    const [enrolRow] = await testDb
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
    await truncateTables();
    service = new ProgressService();
    const user = await createUser();
    const course = await createCourse(user.id);
    userId = user.id;
    courseId = course.id;
  });

  it('updates status to "in_progress" when module is "available"', async () => {
    const mods = await createModules(courseId, 1);
    await createEnrollment(userId, courseId);
    await createModuleProgress(userId, courseId, mods);

    await service.markModuleStarted(userId, mods[0]!.id);

    const [progress] = await testDb
      .select({ status: moduleProgress.status })
      .from(moduleProgress)
      .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.moduleId, mods[0]!.id)));

    expect(progress?.status).toBe('in_progress');
  });

  it('does NOT update a "locked" module to "in_progress"', async () => {
    const mods = await createModules(courseId, 2);
    await createEnrollment(userId, courseId);
    await createModuleProgress(userId, courseId, mods);

    // mods[1] has position=1, so it starts as 'locked'
    await service.markModuleStarted(userId, mods[1]!.id);

    const [progress] = await testDb
      .select({ status: moduleProgress.status })
      .from(moduleProgress)
      .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.moduleId, mods[1]!.id)));

    expect(progress?.status).toBe('locked');
  });
});
