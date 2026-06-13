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

import { courses } from '@autodidact/db';
import { buildApp } from '../app.js';
import { JOB_NAMES } from '../queues/definitions.js';

// ────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  dbHarness = await withTestDatabase();
}, 90_000);

afterAll(async () => {
  await dbHarness?.close();
});

// ────────────────────────────────────────────────────────────────────────────

describe('generate-embedding task endpoint — real DB', () => {
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

  function makeTaskApp(agentClient = makeMockAgentClient()) {
    const app = buildApp({
      agentClient: agentClient as never,
      queueProvider: makeMockQueueProvider() as never,
      logger: makeMockLogger() as never,
      maxAttempts: 3,
    });
    return { app, agentClient };
  }

  it('processes a task POST: stores topic_embedding as non-null pgvector value', async () => {
    // Fixed 1536-dimension vector
    const fixedVector = Array(1536).fill(0.1) as number[];

    const agentClient = makeMockAgentClient();
    (agentClient.generateEmbedding as ReturnType<typeof vi.fn>).mockResolvedValue(fixedVector);
    const { app } = makeTaskApp(agentClient);

    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${JOB_NAMES.GENERATE_EMBEDDING}`,
      payload: { courseId, topic: 'Python' },
    });

    expect(res.statusCode).toBe(204);

    // Assert that topic_embedding is now set (non-null)
    // We query the raw column value via the pool because Drizzle's custom
    // vector type deserialization may vary — we just need non-null.
    const result = await dbHarness.pool.query<{ embedding_set: boolean }>(
      `SELECT topic_embedding IS NOT NULL AS embedding_set FROM courses WHERE id = $1`,
      [courseId],
    );

    expect(result.rows[0]?.embedding_set).toBe(true);
  });

  it('calls agentClient.generateEmbedding with the task topic', async () => {
    const fixedVector = Array(1536).fill(0.1) as number[];
    const agentClient = makeMockAgentClient();
    (agentClient.generateEmbedding as ReturnType<typeof vi.fn>).mockResolvedValue(fixedVector);
    const { app } = makeTaskApp(agentClient);

    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${JOB_NAMES.GENERATE_EMBEDDING}`,
      payload: { courseId, topic: 'Python' },
    });

    expect(res.statusCode).toBe(204);
    expect(agentClient.generateEmbedding).toHaveBeenCalledWith('Python');
  });

  it('never flips course status on embedding failure (course stays ready)', async () => {
    const agentClient = makeMockAgentClient();
    (agentClient.generateEmbedding as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('embed failed'),
    );
    const { app } = makeTaskApp(agentClient);

    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${JOB_NAMES.GENERATE_EMBEDDING}`,
      payload: { courseId, topic: 'Python' },
    });

    // Final attempt (no retry header) → acknowledged, but status untouched.
    expect(res.statusCode).toBe(200);
    const result = await dbHarness.pool.query<{ status: string }>(
      `SELECT status FROM courses WHERE id = $1`,
      [courseId],
    );
    expect(result.rows[0]?.status).toBe('ready');
  });
});
