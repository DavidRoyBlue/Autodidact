/**
 * API-level e2e harness
 *
 * Boots the real NestJS AppModule via @nestjs/testing + supertest against a
 * Testcontainers Postgres. Auth, queue, and ApiAgentClient are mocked at the
 * DI seam; everything else (routing, guards, filter, DB) is real.
 *
 * DB seam:
 *   Uses the canonical `vi.mock('@autodidact/db')` redirect (the same pattern
 *   as the service integration tests in this directory). Vitest transforms the
 *   NestJS source modules and intercepts the `@autodidact/db` specifier, so the
 *   whole app graph — controllers, services, the health check — resolves to the
 *   container-backed Drizzle client. `getDb()` returns `harness.db`; `getPool()`
 *   returns `harness.pool` (HealthController uses the raw pool for `SELECT 1`).
 *   Both are lazy closures so `harness` is populated by request time.
 *
 * Auth seam:
 *   `overrideGuard(AuthGuard).useClass(TestAuthGuard)` keeps real 401 semantics
 *   (missing/malformed header) while injecting the mutable `currentUser` for any
 *   valid Bearer token. `currentUser.id` is kept equal to the seeded user id so
 *   FK columns (courses.generatedBy etc.) resolve. The AUTH_PROVIDER token is
 *   also overridden so AuthModule's async factory never constructs a real
 *   provider.
 *
 * Queue seam:
 *   QUEUE_PROVIDER lives in the @Global QueueModule, so it is overridden cleanly
 *   with a mock (no Redis needed). Overriding it also stops the real
 *   createQueueProvider factory from constructing IORedis.
 *
 * Agent seam:
 *   ApiAgentClient is overridden with a mock embedding. The HealthController's
 *   agent probe goes through global `fetch`, which is stubbed to reject fast so
 *   the probe reports `agent: 'error'` (overall `degraded`) instead of hanging.
 */

import 'reflect-metadata';

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  withTestDatabase,
  type TestDatabase,
  seedUser,
  seedCourse,
  seedModules,
} from '@autodidact/test-support';
import { makeMockQueueProvider } from '@autodidact/config/test-utils';

// ────────────────────────────────────────────────────────────────────────────
// Real-DB harness: assigned in beforeAll; getDb()/getPool() closures defer
// resolution until call time, by which point `harness` is populated.
// ────────────────────────────────────────────────────────────────────────────

let harness: TestDatabase;

vi.mock('@autodidact/db', async () => {
  const { eq, and, sql, or, inArray, desc, asc, gt, lt, gte, lte } = await import('drizzle-orm');
  const schema = await import('../../../../../packages/db/src/schema/index.js');
  return {
    ...schema,
    eq, and, sql, or, inArray, desc, asc, gt, lt, gte, lte,
    getDb: () => harness.db,
    getPool: () => harness.pool,
    supabaseAdmin: null,
  };
});

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../app.module.js';
import { AuthGuard } from '../../modules/auth/auth.guard.js';
import { ApiAgentClient } from '../../services/agent.client.js';
import { QUEUE_PROVIDER_TOKEN } from '../../providers.token.js';
import type { AuthUser } from '@autodidact/types';
import type { Request } from 'express';

// Resolved through the vi.mock above → the same table objects the app uses.
import { enrollments, moduleProgress, chatSessions, eq, and } from '@autodidact/db';

// ────────────────────────────────────────────────────────────────────────────
// Mutable currentUser — updated by beforeEach after seeding a new user.
// TestAuthGuard captures it at request time via the mutable pointer.
// ────────────────────────────────────────────────────────────────────────────

let currentUser: AuthUser = { id: '', supabaseId: '', email: '' };

// ────────────────────────────────────────────────────────────────────────────
// TestAuthGuard: preserves real 401 behaviour (missing/malformed header)
// while injecting `currentUser` for any valid Bearer token.
// ────────────────────────────────────────────────────────────────────────────

@Injectable()
class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing authorization header');
    }
    req.user = currentUser;
    return true;
  }
}

const agentClientMock = {
  generateEmbedding: vi.fn(async () => Array(1536).fill(0.1) as number[]),
};

// ────────────────────────────────────────────────────────────────────────────
// App lifecycle — one container + one NestJS app for the whole file.
// ────────────────────────────────────────────────────────────────────────────

let app: INestApplication;
let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  harness = await withTestDatabase();

  // Stub global fetch so HealthController's agent probe rejects fast (the agent
  // service isn't running in this test). ApiAgentClient is mocked separately, so
  // the only real fetch is the health probe.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('agent unreachable in e2e test');
    }),
  );

  const authProviderMock = { verifyToken: vi.fn(async () => currentUser) };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider('AUTH_PROVIDER')
    .useValue(authProviderMock)
    .overrideProvider(QUEUE_PROVIDER_TOKEN)
    .useValue(makeMockQueueProvider())
    .overrideGuard(AuthGuard)
    .useClass(TestAuthGuard)
    .overrideProvider(ApiAgentClient)
    .useValue(agentClientMock)
    .compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1');
  await app.init();
  request = supertest(app.getHttpServer());
}, 120_000);

afterAll(async () => {
  await app?.close();
  vi.unstubAllGlobals();
  await harness?.close();
});

beforeEach(async () => {
  await harness.truncate();
  agentClientMock.generateEmbedding.mockClear();

  const user = await seedUser(harness.db);
  currentUser = { id: user.id, supabaseId: `sb-${user.id}`, email: 'e2e@test.com' };
});

// ────────────────────────────────────────────────────────────────────────────
// 1. Auth rejection
// ────────────────────────────────────────────────────────────────────────────

describe('Auth rejection', () => {
  it('returns 401 with filter envelope when Authorization header is missing', async () => {
    const res = await request.get('/v1/courses');

    expect(res.status).toBe(401);
    // AllExceptionsFilter shape: { statusCode, timestamp, path, error }
    expect(res.body).toMatchObject({
      statusCode: 401,
      path: '/v1/courses',
      error: expect.objectContaining({ message: 'Missing authorization header' }),
    });
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('returns 200 when a valid Bearer token is supplied', async () => {
    const res = await request.get('/v1/courses').set('Authorization', 'Bearer anytoken');

    expect(res.status).toBe(200);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. Validation
// ────────────────────────────────────────────────────────────────────────────

describe('Validation', () => {
  it('returns 400 with Validation failed for a too-short topic', async () => {
    const res = await request
      .post('/v1/courses')
      .set('Authorization', 'Bearer anytoken')
      .send({ topic: 'ab' }); // topic min length is 3

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      error: expect.objectContaining({
        message: 'Validation failed',
        errors: expect.arrayContaining([
          expect.objectContaining({ path: expect.anything(), message: expect.any(String) }),
        ]),
      }),
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. Health
// ────────────────────────────────────────────────────────────────────────────

describe('Health', () => {
  it('returns 200 with db=ok (agent degraded)', async () => {
    // No auth header required — /health is unguarded
    const res = await request.get('/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.services.db).toBe('ok');
    // Overall status is 'degraded' (agent unreachable in test)
    expect(['ok', 'degraded']).toContain(res.body.status);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. Exception-filter envelope on 404
// ────────────────────────────────────────────────────────────────────────────

describe('Exception filter envelope', () => {
  it('wraps a 404 NotFoundException in the filter shape', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000099';
    const res = await request
      .get(`/v1/courses/${nonExistentId}`)
      .set('Authorization', 'Bearer anytoken');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      statusCode: 404,
      path: `/v1/courses/${nonExistentId}`,
      error: expect.objectContaining({ message: 'Course not found' }),
    });
    expect(typeof res.body.timestamp).toBe('string');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. Courses journey: create → get → enroll → list → progress
// ────────────────────────────────────────────────────────────────────────────

describe('Courses journey', () => {
  it('create → get → enroll → list → progress (real DB assertions)', async () => {
    const auth = { Authorization: 'Bearer anytoken' };

    // ── create course ──
    const createRes = await request
      .post('/v1/courses')
      .set(auth)
      .send({ topic: 'TypeScript', difficulty: 'beginner', moduleCount: 5 });

    expect([200, 201]).toContain(createRes.status);
    const { courseId } = createRes.body as { courseId: string };
    expect(typeof courseId).toBe('string');

    // Seed modules so enroll creates module_progress rows
    const mods = await seedModules(harness.db, courseId, 3);
    expect(mods).toHaveLength(3);

    // ── get course ──
    const getRes = await request.get(`/v1/courses/${courseId}`).set(auth);
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(courseId);
    expect(Array.isArray(getRes.body.modules)).toBe(true);
    expect(getRes.body.modules).toHaveLength(3);

    // ── enroll ──
    const enrollRes = await request.post(`/v1/courses/${courseId}/enroll`).set(auth);
    expect([200, 201]).toContain(enrollRes.status);

    // Assert real DB rows via harness.db (same container, direct connection)
    const [enrollment] = await harness.db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(and(eq(enrollments.userId, currentUser.id), eq(enrollments.courseId, courseId)));
    expect(enrollment).toBeDefined();

    const progressRows = await harness.db
      .select({ status: moduleProgress.status })
      .from(moduleProgress)
      .where(and(eq(moduleProgress.userId, currentUser.id), eq(moduleProgress.courseId, courseId)));
    expect(progressRows).toHaveLength(3);
    // Position 0 is available; positions 1, 2 are locked
    const statuses = progressRows.map((r) => r.status).sort();
    expect(statuses).toEqual(['available', 'locked', 'locked'].sort());

    // ── list courses ──
    const listRes = await request.get('/v1/courses').set(auth);
    expect(listRes.status).toBe(200);
    const listed = listRes.body as Array<{ id: string }>;
    expect(listed.some((c) => c.id === courseId)).toBe(true);

    // ── progress ──
    const progressRes = await request.get(`/v1/progress/${courseId}`).set(auth);
    expect(progressRes.status).toBe(200);
    expect(Array.isArray(progressRes.body)).toBe(true);
    expect(progressRes.body).toHaveLength(3);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 6. Chat session: create + get
// ────────────────────────────────────────────────────────────────────────────

describe('Chat session', () => {
  it('creates a session and retrieves it by id', async () => {
    const auth = { Authorization: 'Bearer anytoken' };

    // Seed a course + module so the FK on chat_sessions.module_id is satisfied
    const course = await seedCourse(harness.db, currentUser.id);
    const [mod] = await seedModules(harness.db, course.id, 1);
    expect(mod).toBeDefined();
    const moduleId = mod!.id;

    // ── create session ──
    const createRes = await request
      .post('/v1/chat/sessions')
      .set(auth)
      .send({ moduleId });

    expect([200, 201]).toContain(createRes.status);
    const session = createRes.body as { id: string; moduleId: string };
    expect(typeof session.id).toBe('string');
    expect(session.moduleId).toBe(moduleId);

    // Assert real DB row via harness.db
    const [dbSession] = await harness.db
      .select({ id: chatSessions.id, moduleId: chatSessions.moduleId })
      .from(chatSessions)
      .where(eq(chatSessions.id, session.id));
    expect(dbSession).toBeDefined();
    expect(dbSession!.moduleId).toBe(moduleId);

    // ── get session ──
    const getRes = await request.get(`/v1/chat/sessions/${session.id}`).set(auth);
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(session.id);
  });
});
