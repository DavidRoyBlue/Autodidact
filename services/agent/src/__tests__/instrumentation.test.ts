import { describe, it, expect, vi } from 'vitest';
import { instrumentNode } from '../graphs/instrumentation.js';

function fakeLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };
}

describe('instrumentNode()', () => {
  it('returns the wrapped node result unchanged', async () => {
    const node = instrumentNode<Record<string, unknown>>('teacher', async () => ({ completionScore: 90 }));
    await expect(node({})).resolves.toEqual({ completionScore: 90 });
  });

  it('invokes the wrapped node with the incoming state', async () => {
    const inner = vi.fn(async () => ({}));
    const node = instrumentNode<Record<string, unknown>>('teacher', inner);
    const state = { messages: [] };
    const config = { configurable: { thread_id: 's1' } };
    await node(state, config as never);
    expect(inner).toHaveBeenCalledWith(state, config);
  });

  it('logs node name, latency, and known state signals on success', async () => {
    const logger = fakeLogger();
    const node = instrumentNode<Record<string, unknown>>(
      'teacher',
      async () => ({ completionSignaled: true, completionScore: 88 }),
      logger as never,
    );
    await node({});
    expect(logger.info).toHaveBeenCalledTimes(1);
    const [fields, msg] = logger.info.mock.calls[0]!;
    expect(fields).toMatchObject({
      node: 'teacher',
      completionSignaled: true,
      completionScore: 88,
    });
    expect(typeof (fields as { latencyMs: number }).latencyMs).toBe('number');
    expect(msg).toMatch(/node/i);
  });

  it('logs an error and rethrows when the node throws', async () => {
    const logger = fakeLogger();
    const node = instrumentNode<Record<string, unknown>>(
      'evaluator',
      async () => {
        throw new Error('llm exploded');
      },
      logger as never,
    );
    await expect(node({})).rejects.toThrow('llm exploded');
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0]![0]).toMatchObject({ node: 'evaluator' });
  });

  it('works without a logger (logging is optional)', async () => {
    const node = instrumentNode<Record<string, unknown>>('teacher', async () => ({ ok: true }));
    await expect(node({})).resolves.toEqual({ ok: true });
  });
});
