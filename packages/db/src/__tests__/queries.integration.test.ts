/**
 * Real-Postgres integration tests for the @autodidact/db query layer.
 *
 * Uses the @autodidact/test-support harness (Testcontainers pgvector/pgvector:pg16)
 * with all migrations applied, so the pgvector extension and every constraint is live.
 *
 * The singleton `db`/`pool` from client.ts is never touched here; all queries go
 * through `harness.db` / `harness.pool` connected to the container.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  withTestDatabase,
  type TestDatabase,
  seedUser,
  seedCourse,
  seedModules,
  seedEnrollment,
} from '@autodidact/test-support';
import { users, courses, modules, enrollments, sql, eq } from '@autodidact/db';

let harness: TestDatabase;

beforeAll(async () => {
  harness = await withTestDatabase();
}, 90_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await harness.truncate();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Round-trip: insert via factories, select back via Drizzle
// ─────────────────────────────────────────────────────────────────────────────

describe('Round-trip: users / courses / modules', () => {
  it('inserts a user and reads it back with the expected email', async () => {
    const seeded = await seedUser(harness.db);

    const [row] = await harness.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, seeded.id));

    expect(row?.id).toBe(seeded.id);
    expect(row?.email).toMatch(/@test\.com$/);
  });

  it('inserts a course and reads it back with the expected fields', async () => {
    const user = await seedUser(harness.db);
    const seeded = await seedCourse(harness.db, user.id);

    const [row] = await harness.db
      .select({
        id: courses.id,
        topic: courses.topic,
        title: courses.title,
        status: courses.status,
      })
      .from(courses)
      .where(eq(courses.id, seeded.id));

    expect(row?.id).toBe(seeded.id);
    expect(row?.topic).toBe('Python');
    expect(row?.title).toBe('Python Basics');
    expect(row?.status).toBe('ready');
  });

  it('inserts modules and reads them back ordered by position', async () => {
    const user = await seedUser(harness.db);
    const course = await seedCourse(harness.db, user.id);
    const seededMods = await seedModules(harness.db, course.id, 3);

    const rows = await harness.db
      .select({ id: modules.id, position: modules.position, title: modules.title })
      .from(modules)
      .where(eq(modules.courseId, course.id))
      .orderBy(modules.position);

    expect(rows).toHaveLength(3);
    expect(rows[0]?.position).toBe(0);
    expect(rows[1]?.position).toBe(1);
    expect(rows[2]?.position).toBe(2);
    expect(rows.map((r) => r.id).sort()).toEqual(seededMods.map((m) => m.id).sort());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. pgvector: store topic_embedding via ::vector cast, query with <=> operator
// ─────────────────────────────────────────────────────────────────────────────

describe('pgvector: topic_embedding round-trip + cosine-distance ordering', () => {
  /**
   * Build a 1536-dim zero vector with one position set to 1.
   * Two "near" courses share high values at the same dimension;
   * "far" course differs completely, so cosine distance is larger.
   */
  function makeVector(hotDimension: number, dims = 1536): number[] {
    const v = new Array<number>(dims).fill(0);
    v[hotDimension] = 1;
    return v;
  }

  it('stores topic_embedding via raw SQL ::vector cast and reads it back as an array', async () => {
    const user = await seedUser(harness.db);
    const course = await seedCourse(harness.db, user.id);

    const embedding = makeVector(0);
    const literal = `[${embedding.join(',')}]`;

    // Mirror the exact pattern used in services/worker/src/processors/embedding.processor.ts
    await harness.db.execute(
      sql`UPDATE courses SET topic_embedding = ${literal}::vector, updated_at = NOW() WHERE id = ${course.id}::uuid`,
    );

    const [row] = await harness.db
      .select({ topicEmbedding: courses.topicEmbedding })
      .from(courses)
      .where(eq(courses.id, course.id));

    expect(row?.topicEmbedding).not.toBeNull();
    expect(Array.isArray(row?.topicEmbedding)).toBe(true);
    expect((row?.topicEmbedding as number[]).length).toBe(1536);
    expect((row?.topicEmbedding as number[])[0]).toBeCloseTo(1, 5);
    expect((row?.topicEmbedding as number[])[1]).toBeCloseTo(0, 5);
  });

  it('cosine-distance <=> ordering returns nearest course first', async () => {
    const user = await seedUser(harness.db);

    // "Near" course: hot at dim 0 (same as probe)
    const nearCourse = await seedCourse(harness.db, user.id);
    const nearVec = makeVector(0);
    const nearLiteral = `[${nearVec.join(',')}]`;

    // "Far" course: hot at dim 1 (orthogonal to probe — maximum cosine distance of 1)
    const farCourse = await seedCourse(harness.db, user.id);
    const farVec = makeVector(1);
    const farLiteral = `[${farVec.join(',')}]`;

    await harness.db.execute(
      sql`UPDATE courses SET topic_embedding = ${nearLiteral}::vector, updated_at = NOW() WHERE id = ${nearCourse.id}::uuid`,
    );
    await harness.db.execute(
      sql`UPDATE courses SET topic_embedding = ${farLiteral}::vector, updated_at = NOW() WHERE id = ${farCourse.id}::uuid`,
    );

    // Probe vector identical to the near course's vector
    const probeVec = makeVector(0);
    const probeLiteral = `[${probeVec.join(',')}]`;

    // cosine distance ordering: probe <=> near = 0, probe <=> far = 1
    const rows = await harness.db.execute(
      sql`SELECT id, topic_embedding <=> ${probeLiteral}::vector AS distance
          FROM courses
          WHERE topic_embedding IS NOT NULL
          ORDER BY distance ASC`,
    );

    expect(rows.rows.length).toBeGreaterThanOrEqual(2);
    // The first result should be the near course
    expect((rows.rows[0] as { id: string }).id).toBe(nearCourse.id);
    // The second result should be the far course
    expect((rows.rows[1] as { id: string }).id).toBe(farCourse.id);
    // Near distance should be 0 (identical vectors), far should be 1 (orthogonal)
    expect(Number((rows.rows[0] as { distance: string }).distance)).toBeCloseTo(0, 5);
    expect(Number((rows.rows[1] as { distance: string }).distance)).toBeCloseTo(1, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Constraint enforcement
// ─────────────────────────────────────────────────────────────────────────────

describe('Constraint: FK and unique', () => {
  it('rejects a modules insert with a non-existent course_id (FK violation)', async () => {
    const fakeUuid = '00000000-0000-0000-0000-000000000000';

    await expect(
      harness.db.insert(modules).values({
        courseId: fakeUuid,
        position: 0,
        title: 'Orphan Module',
        description: 'Should fail',
        objectives: ['obj'],
        contentOutline: [{ title: 'sec', points: ['p'] }],
        estimatedMinutes: 10,
      }),
    ).rejects.toThrow();
  });

  it('enrollments unique (user_id, course_id): onConflictDoUpdate is idempotent', async () => {
    const user = await seedUser(harness.db);
    const course = await seedCourse(harness.db, user.id);

    // First enrollment
    await seedEnrollment(harness.db, user.id, course.id);

    // Second upsert on the same (userId, courseId) — should NOT throw
    const [upserted] = await harness.db
      .insert(enrollments)
      .values({ userId: user.id, courseId: course.id })
      .onConflictDoUpdate({
        target: [enrollments.userId, enrollments.courseId],
        set: { lastAccessedAt: sql`NOW()` },
      })
      .returning({ id: enrollments.id });

    // Exactly one enrollment row should exist in the table
    const rows = await harness.db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(eq(enrollments.userId, user.id));

    expect(rows).toHaveLength(1);
    // The upserted id should match the original row (not a new row)
    expect(upserted?.id).toBe(rows[0]?.id);
  });
});
