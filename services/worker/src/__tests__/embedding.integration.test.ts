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
import { makeMockAgentClient, makeMockLogger } from '@autodidact/config/test-utils';

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

import { courses, sql, eq } from '@autodidact/db';
import { createEmbeddingWorker } from '../processors/embedding.processor.js';
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

describe('embedding processor — real Redis + real DB', () => {
  let courseId: string;
  let userId: string;

  beforeEach(async () => {
    await dbHarness.truncate();

    // Seed a user and a ready course (embedding processor expects status=ready)
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
        status: 'ready',
        generatedBy: userId,
      })
      .returning({ id: courses.id });
    if (!course) throw new Error('Failed to insert course');
    courseId = course.id;
  });

  it('processes a real BullMQ job: stores topic_embedding as non-null pgvector value', async () => {
    // Fixed 1536-dimension vector
    const fixedVector = Array(1536).fill(0.1) as number[];

    const agentClient = makeMockAgentClient();
    // Override generateEmbedding to return our fixed vector
    (agentClient.generateEmbedding as ReturnType<typeof vi.fn>).mockResolvedValue(fixedVector);

    const logger = makeMockLogger();

    const worker = createEmbeddingWorker(
      redisConn,
      agentClient as never,
      logger as never,
    );

    await new Promise<void>((resolve) => {
      if (worker.isRunning()) return resolve();
      worker.once('ready', resolve);
      setTimeout(resolve, 50);
    });

    const queue = new Queue(QUEUES.EMBEDDING, { connection: redisConn });
    try {
      await queue.add(JOB_NAMES.GENERATE_EMBEDDING, {
        courseId,
        topic: 'Python',
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timed out waiting for embedding job')), 30_000);
        worker.once('completed', () => { clearTimeout(timeout); resolve(); });
        worker.once('failed', (_job, err) => { clearTimeout(timeout); reject(err); });
      });
    } finally {
      await worker.close();
      await queue.close();
    }

    // Assert that topic_embedding is now set (non-null)
    // We query the raw column value via execute() because Drizzle's custom
    // vector type deserialization may vary — we just need non-null.
    const result = await dbHarness.pool.query<{ embedding_set: boolean }>(
      `SELECT topic_embedding IS NOT NULL AS embedding_set FROM courses WHERE id = $1`,
      [courseId],
    );

    expect(result.rows[0]?.embedding_set).toBe(true);
  });

  it('calls agentClient.generateEmbedding with the job topic', async () => {
    const agentClient = makeMockAgentClient();
    const logger = makeMockLogger();

    const worker = createEmbeddingWorker(
      redisConn,
      agentClient as never,
      logger as never,
    );

    await new Promise<void>((resolve) => {
      if (worker.isRunning()) return resolve();
      worker.once('ready', resolve);
      setTimeout(resolve, 50);
    });

    const queue = new Queue(QUEUES.EMBEDDING, { connection: redisConn });
    try {
      await queue.add(JOB_NAMES.GENERATE_EMBEDDING, {
        courseId,
        topic: 'Python',
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timed out waiting for embedding job')), 30_000);
        worker.once('completed', () => { clearTimeout(timeout); resolve(); });
        worker.once('failed', (_job, err) => { clearTimeout(timeout); reject(err); });
      });
    } finally {
      await worker.close();
      await queue.close();
    }

    expect(agentClient.generateEmbedding).toHaveBeenCalledWith('Python');
  });
});
