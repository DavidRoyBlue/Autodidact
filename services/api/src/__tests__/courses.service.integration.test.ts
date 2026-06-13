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
import { makeMockAgentClient, makeMockQueueProvider } from '@autodidact/config/test-utils';

// ────────────────────────────────────────────────────────────────────────────
// Real-DB harness: assigned in beforeAll; getDb() closure defers until call time.
// ────────────────────────────────────────────────────────────────────────────

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

import {
  courses,
  modules,
  enrollments,
  moduleProgress,
  eq,
  and,
} from '@autodidact/db';
import { CoursesService } from '../modules/courses/courses.service.js';

// ────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  harness = await withTestDatabase();
}, 90_000);

afterAll(async () => {
  await harness?.close();
});

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * The real pgvector query uses cosine distance <=> and threshold > 0.92.
 * makeMockAgentClient().generateEmbedding returns Array(1536).fill(0.1).
 * We seed a "similar" course with the IDENTICAL vector → cosine distance = 0
 * → similarity = 1.0, which passes the > 0.92 threshold.
 *
 * For a "far" course we use a vector with all zeros except one dimension at 1.0;
 * cosine distance from [0.1, 0.1, …] is close to 1 → similarity ≈ 0 < 0.92.
 */
const SIMILAR_VECTOR = Array(1536).fill(0.1) as number[];
const FAR_VECTOR = [1.0, ...Array(1535).fill(0.0)] as number[];

async function seedCourseWithEmbedding(
  userId: string,
  vector: number[],
  overrides: { topic?: string; slug?: string; status?: string } = {},
) {
  const vectorLiteral = `[${vector.join(',')}]`;
  const slug = overrides.slug ?? `topic-${Math.random().toString(36).slice(2, 8)}`;
  const topic = overrides.topic ?? 'Python';
  const status = overrides.status ?? 'ready';

  const result = await harness.pool.query(
    `INSERT INTO courses (topic, slug, title, description, difficulty, status, is_public, generated_by, topic_embedding)
     VALUES ($1, $2, $3, $4, 'beginner', $5, TRUE, $6, $7::vector)
     RETURNING id`,
    [topic, slug, topic, `Learn ${topic}`, status, userId, vectorLiteral],
  );
  return result.rows[0] as { id: string };
}

// ────────────────────────────────────────────────────────────────────────────

describe('CoursesService.enrollUser()', () => {
  let userId: string;
  let courseId: string;

  beforeEach(async () => {
    await harness.truncate();
    const user = await seedUser(harness.db);
    const course = await seedCourse(harness.db, user.id);
    userId = user.id;
    courseId = course.id;
  });

  it('assigns status="available" to the position-0 module', async () => {
    const mods = await seedModules(harness.db, courseId, 3);
    const service = new CoursesService(makeMockAgentClient() as never, makeMockQueueProvider() as never);
    await service.enrollUser(userId, courseId);

    // mods is ordered by position (seedModules inserts 0, 1, 2)
    const pos0Id = mods[0]!.id;
    const [pos0Progress] = await harness.db
      .select({ status: moduleProgress.status })
      .from(moduleProgress)
      .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.moduleId, pos0Id)));

    expect(pos0Progress?.status).toBe('available');
  });

  it('assigns status="locked" to all modules with position > 0', async () => {
    const mods = await seedModules(harness.db, courseId, 3);
    const service = new CoursesService(makeMockAgentClient() as never, makeMockQueueProvider() as never);
    await service.enrollUser(userId, courseId);

    // mods[1] and mods[2] have position 1 and 2 → must be 'locked'
    for (const mod of mods.slice(1)) {
      const [progress] = await harness.db
        .select({ status: moduleProgress.status })
        .from(moduleProgress)
        .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.moduleId, mod.id)));
      expect(progress?.status).toBe('locked');
    }
  });

  it('creates a moduleProgress row for every module in the course', async () => {
    await seedModules(harness.db, courseId, 4);
    const service = new CoursesService(makeMockAgentClient() as never, makeMockQueueProvider() as never);
    await service.enrollUser(userId, courseId);

    const allProgress = await harness.db
      .select({ id: moduleProgress.id })
      .from(moduleProgress)
      .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.courseId, courseId)));

    expect(allProgress).toHaveLength(4);
  });

  it('is idempotent (onConflictDoNothing): re-enrolling does not duplicate module_progress rows', async () => {
    await seedModules(harness.db, courseId, 2);
    const service = new CoursesService(makeMockAgentClient() as never, makeMockQueueProvider() as never);
    await service.enrollUser(userId, courseId);
    await service.enrollUser(userId, courseId); // second call — must not throw or duplicate

    const allProgress = await harness.db
      .select({ id: moduleProgress.id })
      .from(moduleProgress)
      .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.courseId, courseId)));

    expect(allProgress).toHaveLength(2); // same count, no duplicates
  });

  it('does nothing for a course with no modules', async () => {
    // courseId has no modules seeded
    const service = new CoursesService(makeMockAgentClient() as never, makeMockQueueProvider() as never);
    await service.enrollUser(userId, courseId);

    // Enrollment must still exist
    const [enrollment] = await harness.db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)));
    expect(enrollment).toBeDefined();

    // No module_progress rows
    const allProgress = await harness.db
      .select({ id: moduleProgress.id })
      .from(moduleProgress)
      .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.courseId, courseId)));
    expect(allProgress).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────

describe('CoursesService.createOrReuse() — similarity routing', () => {
  let userId: string;

  beforeEach(async () => {
    await harness.truncate();
    const user = await seedUser(harness.db);
    userId = user.id;
  });

  it('returns reused:true and does NOT enqueue when similar course found', async () => {
    // Seed a ready, public course with the IDENTICAL vector → similarity = 1.0 > 0.92
    const existingCourse = await seedCourseWithEmbedding(userId, SIMILAR_VECTOR, {
      topic: 'Python',
      slug: 'python-existing',
      status: 'ready',
    });

    const queue = makeMockQueueProvider();
    const agentClient = makeMockAgentClient();
    // generateEmbedding returns Array(1536).fill(0.1) = SIMILAR_VECTOR
    const service = new CoursesService(agentClient as never, queue as never);

    const result = await service.createOrReuse(userId, {
      topic: 'Python',
      difficulty: 'beginner',
      moduleCount: 5,
    });

    expect(result.reused).toBe(true);
    expect(result.courseId).toBe(existingCourse.id);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('returns reused:false and enqueues when no similar course exists', async () => {
    // Seed a course with a far vector — similarity ≈ 0 < 0.92 — should not match
    await seedCourseWithEmbedding(userId, FAR_VECTOR, {
      topic: 'Unrelated',
      slug: 'unrelated-course',
      status: 'ready',
    });

    const queue = makeMockQueueProvider();
    const agentClient = makeMockAgentClient();
    const service = new CoursesService(agentClient as never, queue as never);

    const result = await service.createOrReuse(userId, {
      topic: 'Rust',
      difficulty: 'intermediate',
      moduleCount: 8,
    });

    expect(result.reused).toBe(false);
    expect(queue.enqueue).toHaveBeenCalledOnce();

    // Real DB check: new course row must exist in pending status
    const [newCourse] = await harness.db
      .select({ id: courses.id, status: courses.status })
      .from(courses)
      .where(eq(courses.id, result.courseId));
    expect(newCourse?.status).toBe('pending');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Read paths (previously untested)
// ────────────────────────────────────────────────────────────────────────────

describe('CoursesService read paths', () => {
  let userId: string;
  let courseId: string;

  beforeEach(async () => {
    await harness.truncate();
    const user = await seedUser(harness.db);
    const course = await seedCourse(harness.db, user.id);
    userId = user.id;
    courseId = course.id;
  });

  it('getCourse returns the seeded course', async () => {
    const service = new CoursesService(makeMockAgentClient() as never, makeMockQueueProvider() as never);
    const result = await service.getCourse(courseId);
    expect(result.id).toBe(courseId);
    expect(result.topic).toBe('Python');
  });

  it('getCourse throws NotFoundException for a non-existent course', async () => {
    const service = new CoursesService(makeMockAgentClient() as never, makeMockQueueProvider() as never);
    await expect(service.getCourse('00000000-0000-0000-0000-000000000001')).rejects.toThrow(
      'Course not found',
    );
  });

  it('getCourseWithModules returns course with ordered modules', async () => {
    await seedModules(harness.db, courseId, 3);
    const service = new CoursesService(makeMockAgentClient() as never, makeMockQueueProvider() as never);
    const result = await service.getCourseWithModules(courseId);
    expect(result.id).toBe(courseId);
    expect(result.modules).toHaveLength(3);
    // Modules are ordered by position
    expect(result.modules[0]!.position).toBe(0);
    expect(result.modules[1]!.position).toBe(1);
    expect(result.modules[2]!.position).toBe(2);
  });

  it('getUserCourses returns enrolled courses for a user', async () => {
    await seedEnrollment(harness.db, userId, courseId);
    const service = new CoursesService(makeMockAgentClient() as never, makeMockQueueProvider() as never);
    const results = await service.getUserCourses(userId);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe(courseId);
  });

  it('getUserCourses returns empty array for a user with no enrollments', async () => {
    const service = new CoursesService(makeMockAgentClient() as never, makeMockQueueProvider() as never);
    const results = await service.getUserCourses(userId);
    expect(results).toHaveLength(0);
  });
});
