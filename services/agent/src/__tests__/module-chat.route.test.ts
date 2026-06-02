import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ────────────────────────────────────────────────────────────────────────────
// Mock the graph module so route tests don't spin up real LangGraph chains.
// `stream` yields [messageChunk, metadata] tuples like LangGraph's
// streamMode: 'messages'. We include chunks from BOTH the `teacher` and the
// `evaluator` node to prove only teacher tokens reach the SSE stream.
// ────────────────────────────────────────────────────────────────────────────

const mockStream = vi.fn();
const mockGetState = vi.fn();

vi.mock('../graphs/module-chat/graph.js', () => ({
  buildModuleChatGraph: vi.fn().mockReturnValue({
    stream: mockStream,
    getState: mockGetState,
  }),
}));

const { registerModuleChatRoute } = await import('../routes/module-chat.js');

// ────────────────────────────────────────────────────────────────────────────

const validBody = {
  sessionId: '00000000-0000-0000-0000-000000000001',
  message: 'Explain closures',
  moduleBlueprint: { objectives: ['Understand closures'] },
  courseProgress: { courseTitle: 'JS', completedModuleCount: 0, totalModuleCount: 5 },
};

async function* streamTeacherThenEvaluator() {
  // teacher node streams the visible reply
  yield [{ content: 'Closures capture variables.' }, { langgraph_node: 'teacher' }];
  // evaluator node streams its raw scoring JSON — this MUST NOT reach the client
  yield [
    { content: '{"completed":true,"score":90,"feedback":"great"}' },
    { langgraph_node: 'evaluator' },
  ];
}

function parseSseEvents(body: string): Array<Record<string, unknown>> {
  return body
    .split('\n\n')
    .map((b) => b.replace(/^data: /, '').trim())
    .filter(Boolean)
    .map((j) => JSON.parse(j) as Record<string, unknown>);
}

describe('POST /module-chat/stream', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
  });

  afterEach(async () => {
    await app.close();
  });

  it('streams teacher tokens but never the evaluator node output', async () => {
    mockStream.mockReturnValue(streamTeacherThenEvaluator());
    mockGetState.mockResolvedValue({
      values: { completionSignaled: true, completionScore: 90 },
    });

    await registerModuleChatRoute(app, {} as never, {} as never);
    const res = await app.inject({
      method: 'POST',
      url: '/module-chat/stream',
      payload: validBody,
    });

    const events = parseSseEvents(res.body);
    const tokenContents = events
      .filter((e) => e.type === 'token')
      .map((e) => e.content as string);

    // Teacher content is streamed
    expect(tokenContents).toContain('Closures capture variables.');
    // Evaluator JSON is never emitted as a token (its score/feedback are internal).
    // Note: the legitimate module_complete event carries the score, so we assert on
    // token contents only, not the whole SSE body.
    expect(tokenContents.some((c) => c.includes('feedback'))).toBe(false);
    expect(tokenContents.some((c) => c.includes('"completed"'))).toBe(false);
    // Completion event still fires from final graph state
    expect(events).toContainEqual({ type: 'module_complete', score: 90 });
    expect(events).toContainEqual({ type: 'complete' });
  });

  it('passes an abort signal into graph.stream for client-disconnect cancellation', async () => {
    mockStream.mockReturnValue(streamTeacherThenEvaluator());
    mockGetState.mockResolvedValue({ values: { completionSignaled: false } });

    await registerModuleChatRoute(app, {} as never, {} as never);
    await app.inject({ method: 'POST', url: '/module-chat/stream', payload: validBody });

    const streamOpts = mockStream.mock.calls[0]![1] as { signal?: AbortSignal };
    expect(streamOpts.signal).toBeInstanceOf(AbortSignal);
  });

  it('emits a structured error event (no raw detail) when the graph throws', async () => {
    mockStream.mockImplementation(() => {
      throw { status: 503 };
    });

    await registerModuleChatRoute(app, {} as never, {} as never);
    const res = await app.inject({ method: 'POST', url: '/module-chat/stream', payload: validBody });

    const events = parseSseEvents(res.body);
    const errorEvent = events.find((e) => e.type === 'error') as
      | { type: 'error'; code: string; message: string }
      | undefined;
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.code).toBe('upstream_unavailable');
    expect(typeof errorEvent!.message).toBe('string');
    // The old behavior leaked String(error); ensure no raw `error` field remains.
    expect(errorEvent).not.toHaveProperty('error');
  });
});
