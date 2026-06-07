import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  withTestDatabase,
  withTestRedis,
  type TestDatabase,
  type TestRedis,
  seedUser,
} from '@autodidact/test-support';
import { makeMockAgentClient, makeMockQueueProvider, makeMockLogger, sampleBlueprint } from '@autodidact/config/test-utils';

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
import { createCourseGenerationWorker } from '../processors/course-generation.processor.js';
import { QUEUES, JOB_NAMES } from '../queues/definitions.js';

// ────────────────────────────────────────────────────────────────────────────

let redisHarness: TestRedis;
let redisConn: Redis;

beforeAll(async () => {
  [dbHarness, redisHarness] = await Promise.all([withTestDatabase(), withTestRedis()]);
  redisConn = new Redis(redisHarness.url, { maxRetriesPerRequest: null });
}, 90_000);

afterAll(async () => {
  await redisConn.quit();
  await Promise.all([dbHarness?.close(), redisHarness?.close()]);
});

// ────────────────────────────────────────────────────────────────────────────

describe('course-generation processor — real Redis + real DB', () => {
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

  it('processes a real BullMQ job: sets status=ready and inserts modules', async () => {
    const agentClient = makeMockAgentClient();
    const queueProvider = makeMockQueueProvider();
    const logger = makeMockLogger();

    // Build the worker before enqueuing so it's already listening
    const worker = createCourseGenerationWorker(
      redisConn,
      agentClient as never,
      queueProvider as never,
      logger as never,
    );

    // Wait for the worker to be ready (BullMQ needs a tick to register)
    await new Promise<void>((resolve) => {
      if (worker.isRunning()) return resolve();
      worker.once('ready', resolve);
      // If already running, 'ready' may have fired; check again after a tick
      setTimeout(resolve, 50);
    });

    // Enqueue a real job
    const queue = new Queue(QUEUES.COURSE_GENERATION, { connection: redisConn });
    try {
      await queue.add(JOB_NAMES.GENERATE_COURSE, {
        courseId,
        userId,
        topic: 'Python',
        difficulty: 'beginner',
        moduleCount: 1,
      });

      // Await job completion
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timed out waiting for job completion')), 30_000);
        worker.once('completed', () => {
          clearTimeout(timeout);
          resolve();
        });
        worker.once('failed', (_job, err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    } finally {
      await worker.close();
      await queue.close();
    }

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

  it('enqueues an embedding follow-up job after successful course generation', async () => {
    const agentClient = makeMockAgentClient();
    const queueProvider = makeMockQueueProvider();
    const logger = makeMockLogger();

    const worker = createCourseGenerationWorker(
      redisConn,
      agentClient as never,
      queueProvider as never,
      logger as never,
    );

    await new Promise<void>((resolve) => {
      if (worker.isRunning()) return resolve();
      worker.once('ready', resolve);
      setTimeout(resolve, 50);
    });

    const queue = new Queue(QUEUES.COURSE_GENERATION, { connection: redisConn });
    try {
      await queue.add(JOB_NAMES.GENERATE_COURSE, {
        courseId,
        userId,
        topic: 'Python',
        difficulty: 'beginner',
        moduleCount: 1,
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timed out waiting for job completion')), 30_000);
        worker.once('completed', () => { clearTimeout(timeout); resolve(); });
        worker.once('failed', (_job, err) => { clearTimeout(timeout); reject(err); });
      });
    } finally {
      await worker.close();
      await queue.close();
    }

    expect(queueProvider.enqueue).toHaveBeenCalledWith(
      QUEUES.EMBEDDING,
      JOB_NAMES.GENERATE_EMBEDDING,
      { courseId, topic: 'Python' },
      expect.any(Object),
    );
  });
});
