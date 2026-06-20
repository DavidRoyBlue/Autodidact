import 'reflect-metadata';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { toArray } from 'rxjs/operators';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import {
  withTestDatabase,
  type TestDatabase,
  seedUser,
  seedCourse,
  seedModules,
  seedEnrollment,
  seedModuleProgress,
} from '@autodidact/test-support';

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
  chatSessions,
  moduleProgress,
  eq,
  and,
} from '@autodidact/db';
import { InternalServerErrorException } from '@nestjs/common';
import { ChatService } from '../modules/chat/chat.service.js';
import { ProgressService } from '../modules/progress/progress.service.js';
import { ProvisioningService } from '../modules/provisioning/provisioning.service.js';
import { makeMockProvisioningService } from '@autodidact/config/test-utils';

// ────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  harness = await withTestDatabase();
}, 90_000);

afterAll(async () => {
  await harness?.close();
});

// ────────────────────────────────────────────────────────────────────────────
// SSE stream builder — reused across all token-streaming tests
// ────────────────────────────────────────────────────────────────────────────

function makeSseStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`data: ${line}\n`));
      }
      controller.close();
    },
  });
}

async function collectEvents(obs: Observable<MessageEvent>): Promise<MessageEvent[]> {
  return firstValueFrom(obs.pipe(toArray()));
}

// ────────────────────────────────────────────────────────────────────────────

describe('ChatService.createSession() — provisioning gate', () => {
  it('throws InternalServerErrorException for an unprovisioned userId', async () => {
    // Real ProvisioningService — getDb() is redirected to harness.db by the vi.mock above.
    // The truncate in a prior test (or fresh harness) ensures this UUID has no public.users row.
    const unprovisionedUserId = '00000000-0000-0000-0000-000000000099';
    const service = new ChatService(new ProgressService(), new ProvisioningService());

    await expect(
      service.createSession(unprovisionedUserId, '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'),
    ).rejects.toThrow(InternalServerErrorException);
  });
});

describe('ChatService.streamMessage()', () => {
  let userId: string;
  let courseId: string;
  let moduleId: string;
  let sessionId: string;
  let service: ChatService;

  beforeEach(async () => {
    await harness.truncate();

    // Seed real rows so FK constraints are satisfied
    const user = await seedUser(harness.db);
    const course = await seedCourse(harness.db, user.id);
    userId = user.id;
    courseId = course.id;

    const mods = await seedModules(harness.db, courseId, 2);
    moduleId = mods[0]!.id;

    await seedEnrollment(harness.db, userId, courseId);
    await seedModuleProgress(harness.db, userId, courseId, mods);

    // Insert a real chat_sessions row
    const [session] = await harness.db
      .insert(chatSessions)
      .values({ userId, moduleId, threadId: 'test-thread', messages: [] })
      .returning({ id: chatSessions.id });
    if (!session) throw new Error('Failed to create chat session');
    sessionId = session.id;

    // Build real service with real ProgressService (writes real DB rows).
    // ProvisioningService is mocked (no-op) because the seeded user is always provisioned;
    // the unprovisioned rejection path is tested separately below.
    service = new ChatService(new ProgressService(), makeMockProvisioningService() as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Error cases
  // ──────────────────────────────────────────────────────────────────────────

  describe('error cases', () => {
    it('emits an error event when the module is not found', async () => {
      // Use raw SQL to update the session's module_id to a non-existent UUID,
      // bypassing the FK constraint (superuser can do this via session_replication_role).
      // This simulates a session whose module is missing to exercise the "module not found" branch.
      const fakeModuleId = '00000000-0000-0000-0000-000000000001';
      await harness.pool.query(`SET session_replication_role = 'replica'`);
      await harness.pool.query(
        `UPDATE chat_sessions SET module_id = $1 WHERE id = $2`,
        [fakeModuleId, sessionId],
      );
      await harness.pool.query(`SET session_replication_role = 'origin'`);

      const events = await collectEvents(
        service.streamMessage(sessionId, userId, 'hi', 'http://agent'),
      );
      const errorEvent = events.find((e) => {
        const parsed = JSON.parse(e.data as string) as { type: string };
        return parsed.type === 'error';
      });
      expect(errorEvent).toBeDefined();
    });

    it('emits an error event when agent fetch fails (non-ok response)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, body: null, status: 500 }));
      const events = await collectEvents(
        service.streamMessage(sessionId, userId, 'hi', 'http://agent'),
      );
      const errorEvent = events.find((e) => {
        const parsed = JSON.parse(e.data as string) as { type: string };
        return parsed.type === 'error';
      });
      expect(errorEvent).toBeDefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Token streaming
  // ──────────────────────────────────────────────────────────────────────────

  describe('token streaming', () => {
    it('forwards token events from the SSE stream', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          body: makeSseStream([
            JSON.stringify({ type: 'token', content: 'Hello ' }),
            JSON.stringify({ type: 'token', content: 'World' }),
          ]),
        }),
      );
      const events = await collectEvents(
        service.streamMessage(sessionId, userId, 'hi', 'http://agent'),
      );
      const tokenEvents = events.filter((e) => {
        const p = JSON.parse(e.data as string) as { type: string };
        return p.type === 'token';
      });
      expect(tokenEvents).toHaveLength(2);
    });

    it('calls completeModule (real DB effect: module_progress→completed) when score >= 60', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          body: makeSseStream([
            JSON.stringify({ type: 'token', content: 'Great work!' }),
            JSON.stringify({ type: 'complete', score: 80 }),
          ]),
        }),
      );

      await collectEvents(service.streamMessage(sessionId, userId, 'hi', 'http://agent'));

      // Real DB cross-check: module_progress row for position-0 module must be 'completed'
      // with the correct score, proving completeModule wrote through to the real DB.
      const [progress] = await harness.db
        .select({ status: moduleProgress.status, completionScore: moduleProgress.completionScore })
        .from(moduleProgress)
        .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.moduleId, moduleId)));

      expect(progress?.status).toBe('completed');
      expect(progress?.completionScore).toBe(80);
    });

    it('does NOT call completeModule (module_progress stays unchanged) when score < 60', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          body: makeSseStream([
            JSON.stringify({ type: 'token', content: 'Keep going.' }),
            JSON.stringify({ type: 'complete', score: 45 }),
          ]),
        }),
      );

      await collectEvents(service.streamMessage(sessionId, userId, 'hi', 'http://agent'));

      // Real DB cross-check: module_progress for position-0 must NOT be 'completed'
      const [progress] = await harness.db
        .select({ status: moduleProgress.status })
        .from(moduleProgress)
        .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.moduleId, moduleId)));

      expect(progress?.status).not.toBe('completed');
    });
  });
});
