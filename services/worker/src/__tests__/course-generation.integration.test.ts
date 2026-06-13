import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  withTestDatabase,
  type TestDatabase,
  seedUser,
} from '@autodidact/test-support';
import {
  makeMockAgentClient,
  makeMockQueueProvider,
  makeMockLogger,
  sampleBlueprint,
} from '@autodidact/config/test-utils';

// ────────────────────────────────────────────────────────────────────────────
// Redirect @autodidact/db → harness DB
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

import { courses, modules, eq } from '@autodidact/db';
import { buildApp } from '../app.js';
import { QUEUES, JOB_NAMES } from '../queues/definitions.js';

// ────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  dbHarness = await withTestDatabase();
}, 90_000);

afterAll(async () => {
  await dbHarness?.close();
});

// ────────────────────────────────────────────────────────────────────────────

describe('generate-course task endpoint — real DB', () => {
  let courseId: string;
  let userId: string;

  beforeEach(async () => {
    await dbHarness.truncate();

    // Seed a user and a pending course
    const user = await seedUser(dbHarness.db);
    userId = user.id;

    const [course] = await dbHarness.db
      .insert(courses)
      .values({
        topic: 'Python',
        slug: `python-${crypto.randomUUID().slice(0, 8)}`,
        title: 'Python Basics',
        description: 'Learn Python',
        difficulty: 'beginner',
        status: 'pending',
        generatedBy: userId,
      })
      .returning({ id: courses.id });
    if (!course) throw new Error('Failed to insert course');
    courseId = course.id;
  });

  function makeTaskApp(
    agentClient = makeMockAgentClient(),
    queueProvider = makeMockQueueProvider(),
  ) {
    const app = buildApp({
      agentClient: agentClient as never,
      queueProvider: queueProvider as never,
      logger: makeMockLogger() as never,
      maxAttempts: 3,
    });
    return { app, agentClient, queueProvider };
  }

  it('processes a task POST: sets status=ready and inserts modules', async () => {
    const { app } = makeTaskApp();

    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${JOB_NAMES.GENERATE_COURSE}`,
      payload: {
        courseId,
        userId,
        topic: 'Python',
        difficulty: 'beginner',
        moduleCount: 1,
      },
    });

    expect(res.statusCode).toBe(204);

    // Assert DB state
    const [updatedCourse] = await dbHarness.db
      .select({ status: courses.status, title: courses.title })
      .from(courses)
      .where(eq(courses.id, courseId));

    expect(updatedCourse?.status).toBe('ready');
    expect(updatedCourse?.title).toBe(sampleBlueprint.title);

    const insertedModules = await dbHarness.db
      .select({ position: modules.position, title: modules.title })
      .from(modules)
      .where(eq(modules.courseId, courseId));

    expect(insertedModules).toHaveLength(sampleBlueprint.modules.length);
    expect(insertedModules[0]?.title).toBe(sampleBlueprint.modules[0]?.title);
  });

  it('enqueues an embedding follow-up task after successful course generation', async () => {
    const { app, queueProvider } = makeTaskApp();

    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${JOB_NAMES.GENERATE_COURSE}`,
      payload: {
        courseId,
        userId,
        topic: 'Python',
        difficulty: 'beginner',
        moduleCount: 1,
      },
    });

    expect(res.statusCode).toBe(204);
    expect(queueProvider.enqueue).toHaveBeenCalledWith(
      QUEUES.EMBEDDING,
      JOB_NAMES.GENERATE_EMBEDDING,
      { courseId, topic: 'Python' },
    );
  });

  it('replaces (not duplicates) modules when a task is redelivered after the ready-commit', async () => {
    // Simulates: attempt 1 commits the ready-transaction but fails on the
    // follow-up embedding enqueue → 500 → Cloud Tasks redelivers the task.
    const queueProvider = makeMockQueueProvider();
    (queueProvider.enqueue as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('cloud tasks unavailable'),
    );
    const { app } = makeTaskApp(makeMockAgentClient(), queueProvider);

    const payload = { courseId, userId, topic: 'Python', difficulty: 'beginner', moduleCount: 1 };
    const first = await app.inject({
      method: 'POST',
      url: `/tasks/${JOB_NAMES.GENERATE_COURSE}`,
      payload,
      headers: { 'x-cloudtasks-taskretrycount': '0' },
    });
    expect(first.statusCode).toBe(500); // modules committed, enqueue failed

    const second = await app.inject({
      method: 'POST',
      url: `/tasks/${JOB_NAMES.GENERATE_COURSE}`,
      payload,
      headers: { 'x-cloudtasks-taskretrycount': '1' },
    });
    expect(second.statusCode).toBe(204);

    const moduleRows = await dbHarness.db
      .select({ position: modules.position })
      .from(modules)
      .where(eq(modules.courseId, courseId));
    expect(moduleRows).toHaveLength(sampleBlueprint.modules.length);
  });

  it('marks the course failed in the DB when the final attempt fails', async () => {
    const agentClient = makeMockAgentClient();
    (agentClient.generateCourse as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('agent down'),
    );
    const { app } = makeTaskApp(agentClient);

    // No retry-count header → treated as the single, final attempt (loopback).
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${JOB_NAMES.GENERATE_COURSE}`,
      payload: {
        courseId,
        userId,
        topic: 'Python',
        difficulty: 'beginner',
        moduleCount: 1,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'failed' });

    const [failedCourse] = await dbHarness.db
      .select({ status: courses.status })
      .from(courses)
      .where(eq(courses.id, courseId));

    expect(failedCourse?.status).toBe('failed');
  });

  it('returns 500 and leaves the course in generating on a non-final attempt', async () => {
    const agentClient = makeMockAgentClient();
    (agentClient.generateCourse as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('agent down'),
    );
    const { app } = makeTaskApp(agentClient);

    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${JOB_NAMES.GENERATE_COURSE}`,
      payload: {
        courseId,
        userId,
        topic: 'Python',
        difficulty: 'beginner',
        moduleCount: 1,
      },
      headers: { 'x-cloudtasks-taskretrycount': '0' }, // first of 3 attempts
    });

    expect(res.statusCode).toBe(500);

    const [course] = await dbHarness.db
      .select({ status: courses.status })
      .from(courses)
      .where(eq(courses.id, courseId));

    // Still in-flight: Cloud Tasks will redeliver and the next attempt reruns.
    expect(course?.status).toBe('generating');
  });
});
