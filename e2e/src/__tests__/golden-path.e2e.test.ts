import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { courses, modules, enrollments, moduleProgress, eq, and, asc } from '@autodidact/db';
import { seedUser } from '@autodidact/test-support';
import { startCrossServiceHarness, type CrossServiceHarness } from '../harness.js';

let harness: CrossServiceHarness;
let userId: string;
let token: string;

beforeAll(async () => {
  harness = await startCrossServiceHarness();
}, 180_000);

afterAll(async () => {
  await harness?.stop();
});

beforeAll(async () => {
  // Seed the authenticated principal so the mock-auth token id matches FK columns.
  const user = await seedUser(harness.db);
  userId = user.id;
  token = `test-${user.id}`;
});

function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${harness.apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

interface SseEvent {
  type: string;
  [key: string]: unknown;
}

/** Drive a chat turn over SSE (POST, like the mobile client) and collect events. */
async function streamChat(sessionId: string, content: string): Promise<SseEvent[]> {
  const res = await authedFetch(`/v1/chat/sessions/${sessionId}/stream`, {
    method: 'POST',
    headers: { Accept: 'text/event-stream' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`stream failed: ${res.status} ${await res.text().catch(() => '')}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const events: SseEvent[] = [];
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      for (const line of frame.split('\n')) {
        const m = /^data:\s?(.*)$/.exec(line);
        if (!m) continue;
        try {
          events.push(JSON.parse(m[1]!) as SseEvent);
        } catch {
          /* non-JSON keep-alive frame */
        }
      }
    }
  }
  return events;
}

async function waitForCourseReady(courseId: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    const [row] = await harness.db
      .select({ status: courses.status })
      .from(courses)
      .where(eq(courses.id, courseId));
    last = row?.status ?? 'missing';
    if (last === 'ready') return;
    if (last === 'failed') throw new Error(`Course ${courseId} generation failed`);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Course ${courseId} never reached 'ready' (last status: ${last})`);
}

describe('Golden path: create → generate (worker+agent, mock LLM) → enroll → progress', () => {
  let courseId: string;
  let firstModuleId: string;

  it('creates a course and the worker generates it via the agent', async () => {
    const res = await authedFetch('/v1/courses', {
      method: 'POST',
      body: JSON.stringify({ topic: 'Cross-service TypeScript', difficulty: 'beginner', moduleCount: 3 }),
    });
    expect([200, 201]).toContain(res.status);
    const body = (await res.json()) as { courseId: string; status: string };
    courseId = body.courseId;
    expect(typeof courseId).toBe('string');
    expect(body.status).toBe('pending');

    // Worker receives the loopback task POST, calls the agent (mock LLM), writes ready + modules.
    await waitForCourseReady(courseId);

    const mods = await harness.db
      .select({ id: modules.id, position: modules.position })
      .from(modules)
      .where(eq(modules.courseId, courseId))
      .orderBy(asc(modules.position));
    expect(mods.length).toBeGreaterThanOrEqual(3);
    firstModuleId = mods[0]!.id;
  });

  it('returns the generated course over HTTP with its modules', async () => {
    const res = await authedFetch(`/v1/courses/${courseId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; status: string; modules: unknown[] };
    expect(body.id).toBe(courseId);
    expect(body.status).toBe('ready');
    expect(body.modules.length).toBeGreaterThanOrEqual(3);
  });

  it('enrolls the user and initialises module_progress (pos0 available, rest locked)', async () => {
    const res = await authedFetch(`/v1/courses/${courseId}/enroll`, { method: 'POST' });
    expect([200, 201]).toContain(res.status);

    const [enrollment] = await harness.db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)));
    expect(enrollment).toBeDefined();

    const progress = await harness.db
      .select({ status: moduleProgress.status })
      .from(moduleProgress)
      .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.courseId, courseId)));
    expect(progress.length).toBeGreaterThanOrEqual(3);
    const available = progress.filter((p) => p.status === 'available').length;
    const locked = progress.filter((p) => p.status === 'locked').length;
    expect(available).toBe(1);
    expect(locked).toBe(progress.length - 1);
  });

  it('a chat turn (SSE) completes the module and unlocks the next', async () => {
    // Open a session on the first (available) module.
    const sessionRes = await authedFetch('/v1/chat/sessions', {
      method: 'POST',
      body: JSON.stringify({ moduleId: firstModuleId }),
    });
    expect([200, 201]).toContain(sessionRes.status);
    const session = (await sessionRes.json()) as { id: string };

    // Drive one turn — the mock teacher replies with [MODULE_COMPLETE:score=85],
    // so the agent emits a completion the api applies as completeModule.
    const events = await streamChat(session.id, 'I understand this module now.');
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'complete' || e.type === 'module_complete')).toBe(true);

    // Module pos0 → completed; pos1 → unlocked (available). Poll briefly: the api
    // applies completion after the SSE stream closes.
    const deadline = Date.now() + 10_000;
    let pos0 = '';
    let pos1 = '';
    while (Date.now() < deadline) {
      const rows = await harness.db
        .select({ position: modules.position, status: moduleProgress.status })
        .from(moduleProgress)
        .innerJoin(modules, eq(moduleProgress.moduleId, modules.id))
        .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.courseId, courseId)))
        .orderBy(asc(modules.position));
      pos0 = rows.find((r) => r.position === 0)?.status ?? '';
      pos1 = rows.find((r) => r.position === 1)?.status ?? '';
      if (pos0 === 'completed' && pos1 === 'available') break;
      await new Promise((r) => setTimeout(r, 300));
    }
    expect(pos0).toBe('completed');
    expect(pos1).toBe('available');
  });
});

describe('Failure path: auth rejection', () => {
  it('rejects a request with a non-test token (mock auth)', async () => {
    const res = await fetch(`${harness.apiUrl}/v1/courses`, {
      headers: { Authorization: 'Bearer not-a-test-token' },
    });
    expect(res.status).toBe(401);
  });

  it('rejects a request with no Authorization header', async () => {
    const res = await fetch(`${harness.apiUrl}/v1/courses`);
    expect(res.status).toBe(401);
  });
});
