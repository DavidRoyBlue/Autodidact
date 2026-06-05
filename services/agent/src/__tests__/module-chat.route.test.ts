import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ────────────────────────────────────────────────────────────────────────────
// Fake graph — controls what the SSE stream emits. The graph module is mocked so
// route tests don't spin up real LangGraph chains. `stream` yields
// [messageChunk, metadata] tuples like LangGraph's streamMode: 'messages';
// metadata carries `langgraph_node` so we can prove only teacher tokens reach
// the client.
// ────────────────────────────────────────────────────────────────────────────

const fakeStream = vi.fn();
const fakeGetState = vi.fn();
const fakeGraph = { stream: fakeStream, getState: fakeGetState };

vi.mock('../graphs/module-chat/graph.js', () => ({
  buildModuleChatGraph: vi.fn().mockReturnValue(fakeGraph),
}));

const { registerModuleChatRoute } = await import('../routes/module-chat.js');

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

// The route filters on `meta.langgraph_node === 'teacher'`, so fixtures default
// to teacher metadata; pass a different node to simulate non-teacher output.
async function* makeStreamFixture(
  chunks: Array<{ content: string }>,
  node = 'teacher',
) {
  for (const chunk of chunks) {
    yield [chunk, { langgraph_node: node }];
  }
}

function parseSSEBody(body: string): Array<Record<string, unknown>> {
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
    // buildModuleChatGraph is mocked, so the provider args are unused.
    await registerModuleChatRoute(app, {} as never, {} as never);
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

  // ── Node filtering: only teacher tokens reach the client ─────────────────

  describe('node filtering', () => {
    it('streams teacher tokens but never the evaluator node output', async () => {
      fakeStream.mockReturnValue(
        (async function* () {
          // teacher node streams the visible reply
          yield [{ content: 'Closures capture variables.' }, { langgraph_node: 'teacher' }];
          // evaluator node streams raw scoring JSON — MUST NOT reach the client
          yield [
            { content: '{"completed":true,"score":90,"feedback":"great"}' },
            { langgraph_node: 'evaluator' },
          ];
        })(),
      );
      fakeGetState.mockReturnValue({
        values: { completionSignaled: true, completionScore: 90 },
      });

      const res = await app.inject({ method: 'POST', url: '/module-chat/stream', payload: validPayload });
      const events = parseSSEBody(res.body);
      const tokenContents = events
        .filter((e) => e['type'] === 'token')
        .map((e) => e['content'] as string);

      // Teacher content is streamed; evaluator JSON is filtered out.
      expect(tokenContents).toContain('Closures capture variables.');
      expect(tokenContents.some((c) => c.includes('feedback'))).toBe(false);
      expect(tokenContents.some((c) => c.includes('"completed"'))).toBe(false);
      // The legitimate module_complete event still carries the score from final state.
      expect(events).toContainEqual({ type: 'module_complete', score: 90 });
      expect(events).toContainEqual({ type: 'complete' });
    });
  });

  // ── Client-disconnect cancellation ───────────────────────────────────────

  describe('abort signal', () => {
    it('passes an abort signal into graph.stream', async () => {
      fakeStream.mockReturnValue(makeStreamFixture([]));
      fakeGetState.mockReturnValue({ values: { completionSignaled: false } });

      await app.inject({ method: 'POST', url: '/module-chat/stream', payload: validPayload });

      const streamOpts = fakeStream.mock.calls[0]![1] as { signal?: AbortSignal };
      expect(streamOpts.signal).toBeInstanceOf(AbortSignal);
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

  // ── Structured error event (no raw detail) ───────────────────────────────

  describe('error event when graph.stream throws', () => {
    it('emits a structured error event (code + message, no raw detail)', async () => {
      fakeStream.mockImplementation(() => {
        throw { status: 503 };
      });

      const res = await app.inject({ method: 'POST', url: '/module-chat/stream', payload: validPayload });
      const events = parseSSEBody(res.body);
      const errorEvent = events.find((e) => e['type'] === 'error') as
        | { type: 'error'; code: string; message: string }
        | undefined;

      expect(errorEvent).toBeDefined();
      expect(errorEvent!.code).toBe('upstream_unavailable');
      expect(typeof errorEvent!.message).toBe('string');
      // The old behavior leaked String(error); ensure no raw `error` field remains.
      expect(errorEvent).not.toHaveProperty('error');
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
