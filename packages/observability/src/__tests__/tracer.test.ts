import { describe, it, expect, vi, afterEach } from 'vitest';
import { withSpan, setSpanAttributes, isLangSmithTracingEnabled } from '../tracer.js';

// These tests run without an active OTEL SDK, so `trace.getTracer()` returns the
// no-op tracer. The contract we assert is that the helpers are transparent
// wrappers: they run the work, return its value, propagate errors, and never
// throw on their own — regardless of whether tracing is actually exporting.

describe('withSpan()', () => {
  it('returns the resolved value of the wrapped function', async () => {
    const result = await withSpan('test.span', async () => 42);
    expect(result).toBe(42);
  });

  it('invokes the wrapped function exactly once', async () => {
    const fn = vi.fn(async () => 'ok');
    await withSpan('test.span', fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('propagates errors thrown by the wrapped function', async () => {
    await expect(
      withSpan('test.span', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('accepts span attributes without throwing', async () => {
    await expect(
      withSpan('test.span', async () => 'ok', { 'graph.node': 'teacher' }),
    ).resolves.toBe('ok');
  });
});

describe('setSpanAttributes()', () => {
  it('is a no-op (does not throw) when there is no active span', () => {
    expect(() => setSpanAttributes({ 'llm.tokens': 123 })).not.toThrow();
  });

  it('does not throw when called inside withSpan', async () => {
    await expect(
      withSpan('test.span', async () => {
        setSpanAttributes({ 'llm.model': 'gpt-4o', 'llm.tokens': 50 });
        return 'ok';
      }),
    ).resolves.toBe('ok');
  });
});

describe('isLangSmithTracingEnabled()', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns true when LANGCHAIN_TRACING_V2=true', () => {
    vi.stubEnv('LANGCHAIN_TRACING_V2', 'true');
    expect(isLangSmithTracingEnabled()).toBe(true);
  });

  it('returns true when LANGSMITH_TRACING=true', () => {
    vi.stubEnv('LANGSMITH_TRACING', 'true');
    expect(isLangSmithTracingEnabled()).toBe(true);
  });

  it('returns false when neither tracing env var is set to true', () => {
    vi.stubEnv('LANGCHAIN_TRACING_V2', '');
    vi.stubEnv('LANGSMITH_TRACING', '');
    expect(isLangSmithTracingEnabled()).toBe(false);
  });
});
