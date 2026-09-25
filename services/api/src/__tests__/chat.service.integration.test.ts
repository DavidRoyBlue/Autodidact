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
import { makeMockProvisioningService, makeMockAgentClient } from '@autodidact/config/test-utils';
import { ApiPlatformClient } from '../services/agent-platform.client.js';

// ────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  harness = await withTestDatabase();
}, 90_000);

afterAll(async () => {
  await harness?.close();
});

// ────────────────────────────────────────────────────────────────────────────
// The platform, stubbed at fetch: a thread on demand, a queued run, then the
// run read back completed with the reply the test chose.
// ────────────────────────────────────────────────────────────────────────────

function stubPlatform(
  reply: { reply: string; module_complete: boolean; score: number | null },
  terminal: { status: string; error?: string } = { status: 'completed' },
) {
  const calls: Array<{ method: string; url: string; body?: unknown }> = [];
  const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, url, body: init?.body ? JSON.parse(init.body) : undefined });
      if (url.endsWith('/api/v1/threads')) return json({ id: 'thr_1' });
      if (url.endsWith('/api/v1/runs')) return json({ id: 'run_1', status: 'queued', output: null, error: null });
      if (url.endsWith('/api/v1/runs/run_1')) {
        return json({
          id: 'run_1',
          status: terminal.status,
          output: terminal.status === 'completed' ? reply : null,
          error: terminal.error ?? null,
        });
      }
      return { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' };
    }),
  );
  return calls;
}

async function collectEvents(obs: Observable<MessageEvent>): Promise<MessageEvent[]> {
  return firstValueFrom(obs.pipe(toArray()));
}

const NOT_DONE = { reply: 'Tell me what a resolver does.', module_complete: false, score: null };
const DONE = { reply: 'That covers every objective.', module_complete: true, score: 80 };

// ────────────────────────────────────────────────────────────────────────────

describe('ChatService.createSession() — provisioning gate', () => {
  it('throws InternalServerErrorException for an unprovisioned userId', async () => {
    await harness.truncate();
    const service = new ChatService(new ProgressService(), new ProvisioningService(), makeMockAgentClient() as never, new ApiPlatformClient());
    await expect(service.createSession('00000000-0000-0000-0000-000000000000', 'mod', 'course')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
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

    const [session] = await harness.db
      .insert(chatSessions)
      .values({ userId, moduleId, messages: [] })
      .returning({ id: chatSessions.id });
    if (!session) throw new Error('Failed to create chat session');
    sessionId = session.id;

    // Real ProgressService (writes real DB rows); provisioning mocked because the
    // seeded user is always provisioned; embeddings mocked (the chunk table is empty).
    service = new ChatService(new ProgressService(), makeMockProvisioningService() as never, makeMockAgentClient() as never, new ApiPlatformClient());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('emits an error event when the session is gone', async () => {
    await harness.db.delete(chatSessions).where(eq(chatSessions.id, sessionId));
    stubPlatform(NOT_DONE);
    const events = await collectEvents(service.streamMessage(sessionId, userId, 'hi'));
    const last = JSON.parse(events.at(-1)!.data as string) as { type: string; error: string };
    expect(last.type).toBe('error');
    expect(last.error).toContain('Session not found');
  });

  it('opens a platform thread on the first turn and sends the module with the learner text', async () => {
    const calls = stubPlatform(NOT_DONE);
    const events = await collectEvents(service.streamMessage(sessionId, userId, 'What is DNS?'));

    expect(calls.map((c) => `${c.method} ${c.url.replace(/^http:\/\/[^/]+/, '')}`)).toEqual([
      'POST /api/v1/threads',
      'POST /api/v1/runs',
      'GET /api/v1/runs/run_1',
    ]);
    const run = calls[1]!.body as { agent_id: string; thread_id: string; input: { message: string } };
    expect(run.agent_id).toBe('course-teacher');
    expect(run.thread_id).toBe('thr_1');
    expect(run.input.message).toContain('Module 1/2: Module 0');
    expect(run.input.message).toContain('Lesson:\n## Section');
    expect(run.input.message.endsWith('Learner: What is DNS?')).toBe(true);

    expect(events.map((e) => (JSON.parse(e.data as string) as { type: string }).type)).toEqual(['token', 'complete']);
    const [session] = await harness.db.select({ threadId: chatSessions.threadId, messages: chatSessions.messages }).from(chatSessions).where(eq(chatSessions.id, sessionId));
    expect(session?.threadId).toBe('thr_1');
    expect(session?.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(session?.messages[1]?.content).toBe(NOT_DONE.reply);
  });

  it('sends only the learner text on later turns, on the same thread', async () => {
    await harness.db.update(chatSessions).set({ threadId: 'thr_1' }).where(eq(chatSessions.id, sessionId));
    const calls = stubPlatform(NOT_DONE);
    await collectEvents(service.streamMessage(sessionId, userId, 'And a stub resolver?'));

    expect(calls.some((c) => c.url.endsWith('/api/v1/threads'))).toBe(false);
    const run = calls[0]!.body as { thread_id: string; input: { message: string } };
    expect(run.thread_id).toBe('thr_1');
    expect(run.input.message).toBe('And a stub resolver?');
  });

  it('calls completeModule (real DB effect: module_progress→completed) when the teacher completes at >= 60', async () => {
    stubPlatform(DONE);
    const events = await collectEvents(service.streamMessage(sessionId, userId, 'I get it now'));
    expect(events.map((e) => (JSON.parse(e.data as string) as { type: string }).type)).toEqual(['token', 'module_complete', 'complete']);

    const [progress] = await harness.db
      .select({ status: moduleProgress.status, completionScore: moduleProgress.completionScore })
      .from(moduleProgress)
      .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.moduleId, moduleId)));

    expect(progress?.status).toBe('completed');
    expect(progress?.completionScore).toBe(80);
  });

  it('does NOT call completeModule when the teacher completes below 60', async () => {
    stubPlatform({ ...DONE, score: 45 });
    await collectEvents(service.streamMessage(sessionId, userId, 'hi'));

    const [progress] = await harness.db
      .select({ status: moduleProgress.status })
      .from(moduleProgress)
      .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.moduleId, moduleId)));

    expect(progress?.status).not.toBe('completed');
  });

  it('emits an error event when the platform run fails', async () => {
    stubPlatform(NOT_DONE, { status: 'failed', error: 'model unavailable' });
    const events = await collectEvents(service.streamMessage(sessionId, userId, 'hi'));
    const last = JSON.parse(events.at(-1)!.data as string) as { type: string; error: string };
    expect(last.type).toBe('error');
    expect(last.error).toContain('run_1 failed: model unavailable');
  });
});
