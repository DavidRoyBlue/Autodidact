import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { MemorySaver } from '@langchain/langgraph';
import { makeMockLLMProvider } from '@autodidact/config/test-utils';
import type { ICheckpointerProvider } from '@autodidact/providers';

// ────────────────────────────────────────────────────────────────────────────
// Fake graph — controls what the SSE stream emits
// ────────────────────────────────────────────────────────────────────────────

const fakeStream = vi.fn();
const fakeGetState = vi.fn();
const fakeGraph = { stream: fakeStream, getState: fakeGetState };

vi.mock('../graphs/module-chat/graph.js', () => ({
  buildModuleChatGraph: vi.fn().mockReturnValue(fakeGraph),
}));

const { registerModuleChatRoute } = await import('../routes/module-chat.js');

// ────────────────────────────────────────────────────────────────────────────
// Inline MemoryCheckpointerProvider — avoids the dist/source boundary issue
// when calling createCheckpointer() from @autodidact/providers
// ────────────────────────────────────────────────────────────────────────────

function makeMemoryCheckpointerProvider(): ICheckpointerProvider {
  const saver = new MemorySaver();
  return { getCheckpointer: () => saver };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

async function* makeStreamFixture(chunks: Array<{ content: string }>) {
  for (const chunk of chunks) {
    yield [chunk, {}];
  }
}

function parseSSEBody(body: string) {
  return body
    .split('\n\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line.replace(/^data: /, '')) as Record<string, unknown>);
}

const validPayload = {
  sessionId: '00000000-0000-0000-0000-000000000001',
  message: 'Hello teacher',
  moduleBlueprint: {
    id: 'mod-1',
    position: 0,
    title: 'Variables',
    description: 'Learn Python variables.',
    objectives: ['Declare variables'],
    contentOutline: [{ title: 'Basics', points: ['Assignment'] }],
    estimatedMinutes: 30,
  },
  courseProgress: {
    courseTitle: 'Python',
    completedModuleCount: 0,
    totalModuleCount: 3,
  },
  isFirstMessage: true,
};

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe('POST /module-chat/stream', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await registerModuleChatRoute(app, makeMockLLMProvider() as never, makeMemoryCheckpointerProvider());
  });

  afterEach(async () => {
    await app.close();
  });

  // ── SSE headers ────────────────────────────────────────────────────────

  describe('SSE response headers', () => {
    it('sets Content-Type: text/event-stream', async () => {
      fakeStream.mockReturnValue(makeStreamFixture([]));
      fakeGetState.mockReturnValue({ values: { completionSignaled: false } });
      const res = await app.inject({ method: 'POST', url: '/module-chat/stream', payload: validPayload });
      expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    });
  });

  // ── Normal streaming ────────────────────────────────────────────────────

  describe('token streaming (no completion)', () => {
    it('emits two token events followed by complete', async () => {
      fakeStream.mockReturnValue(
        makeStreamFixture([{ content: 'Hel' }, { content: 'lo' }]),
      );
      fakeGetState.mockReturnValue({ values: { completionSignaled: false } });

      const res = await app.inject({ method: 'POST', url: '/module-chat/stream', payload: validPayload });
      const events = parseSSEBody(res.body);

      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({ type: 'token', content: 'Hel' });
      expect(events[1]).toEqual({ type: 'token', content: 'lo' });
      expect(events[2]).toEqual({ type: 'complete' });
    });

    it('passes thread_id equal to sessionId in the graph config', async () => {
      fakeStream.mockReturnValue(makeStreamFixture([]));
      fakeGetState.mockReturnValue({ values: { completionSignaled: false } });

      await app.inject({ method: 'POST', url: '/module-chat/stream', payload: validPayload });

      expect(fakeStream).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          configurable: { thread_id: validPayload.sessionId },
        }),
      );
    });

    it('calls getState with the same config used for stream', async () => {
      fakeStream.mockReturnValue(makeStreamFixture([]));
      fakeGetState.mockReturnValue({ values: { completionSignaled: false } });

      await app.inject({ method: 'POST', url: '/module-chat/stream', payload: validPayload });

      expect(fakeGetState).toHaveBeenCalledWith(
        expect.objectContaining({
          configurable: { thread_id: validPayload.sessionId },
        }),
      );
    });
  });

  // ── module_complete event ───────────────────────────────────────────────

  describe('module_complete event when completionSignaled=true', () => {
    it('emits module_complete with score before complete', async () => {
      fakeStream.mockReturnValue(
        makeStreamFixture([{ content: 'Hel' }, { content: 'lo' }]),
      );
      fakeGetState.mockReturnValue({
        values: { completionSignaled: true, completionScore: 85 },
      });

      const res = await app.inject({ method: 'POST', url: '/module-chat/stream', payload: validPayload });
      const events = parseSSEBody(res.body);

      expect(events).toHaveLength(4);
      expect(events[0]).toEqual({ type: 'token', content: 'Hel' });
      expect(events[1]).toEqual({ type: 'token', content: 'lo' });
      expect(events[2]).toEqual({ type: 'module_complete', score: 85 });
      expect(events[3]).toEqual({ type: 'complete' });
    });

    it('does NOT emit module_complete when completionSignaled=false', async () => {
      fakeStream.mockReturnValue(makeStreamFixture([]));
      fakeGetState.mockReturnValue({ values: { completionSignaled: false } });

      const res = await app.inject({ method: 'POST', url: '/module-chat/stream', payload: validPayload });
      const events = parseSSEBody(res.body);

      expect(events.every((e) => e['type'] !== 'module_complete')).toBe(true);
    });
  });

  // ── Error event ─────────────────────────────────────────────────────────

  describe('error event when graph.stream throws', () => {
    it('emits a single error event with the error message', async () => {
      fakeStream.mockImplementation(() => {
        throw new Error('graph exploded');
      });

      const res = await app.inject({ method: 'POST', url: '/module-chat/stream', payload: validPayload });
      const events = parseSSEBody(res.body);

      expect(events).toHaveLength(1);
      expect(events[0]?.['type']).toBe('error');
      expect(String(events[0]?.['error'])).toContain('graph exploded');
    });

    it('does not emit complete after an error', async () => {
      fakeStream.mockImplementation(() => {
        throw new Error('boom');
      });

      const res = await app.inject({ method: 'POST', url: '/module-chat/stream', payload: validPayload });
      const events = parseSSEBody(res.body);

      expect(events.every((e) => e['type'] !== 'complete')).toBe(true);
    });
  });
});
