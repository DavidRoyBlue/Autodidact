import { describe, it, expect, vi, afterEach } from 'vitest';
import { withSpan, setSpanAttributes, isLangSmithTracingEnabled } from '../tracer.js';

// ── Shared mock state ────────────────────────────────────────────────────────
// Hoist the spy instances so they are created before vi.mock factories run
// and are accessible in both the factory closures and test bodies.
const { mockStart, mockShutdown, MockNodeSDK } = vi.hoisted(() => {
  const mockShutdown = vi.fn().mockResolvedValue(undefined);
  const mockStart = vi.fn();
  const MockNodeSDK = vi.fn().mockImplementation(() => ({
    start: mockStart,
    shutdown: mockShutdown,
  }));
  return { mockStart, mockShutdown, MockNodeSDK };
});

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: MockNodeSDK,
}));

vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@opentelemetry/resources', () => ({
  Resource: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@opentelemetry/semantic-conventions', () => ({
  ATTR_SERVICE_NAME: 'service.name',
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('initTracer() / shutdownTracer()', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
    process.removeAllListeners('SIGTERM');
  });

  // ─── No-op branch ─────────────────────────────────────────────────────────

  describe('no-op branch (OTEL_EXPORTER_OTLP_ENDPOINT unset)', () => {
    it('does not throw when the env var is absent', async () => {
      vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', '');
      const { initTracer } = await import('../tracer.js');
      expect(() => initTracer('svc')).not.toThrow();
    });

    it('does not construct a NodeSDK when the env var is absent', async () => {
      vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', '');
      const { initTracer } = await import('../tracer.js');
      initTracer('svc');
      expect(MockNodeSDK).not.toHaveBeenCalled();
    });

    it('shutdownTracer() resolves without error when never initialized', async () => {
      vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', '');
      const { initTracer, shutdownTracer } = await import('../tracer.js');
      initTracer('svc');
      await expect(shutdownTracer()).resolves.toBeUndefined();
    });
  });

  // ─── Active branch ─────────────────────────────────────────────────────────

  describe('active branch (OTEL_EXPORTER_OTLP_ENDPOINT set)', () => {
    it('calls sdk.start() when the endpoint env var is set', async () => {
      vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://collector:4318');
      // Fresh module so the module-level `sdk` singleton starts as null
      vi.resetModules();
      const { initTracer } = await import('../tracer.js');

      initTracer('my-service');

      expect(MockNodeSDK).toHaveBeenCalledOnce();
      expect(mockStart).toHaveBeenCalledOnce();
    });

    it('passes resource and traceExporter options to the NodeSDK constructor', async () => {
      vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://collector:4318');
      vi.resetModules();
      const { initTracer } = await import('../tracer.js');

      initTracer('checkout-service');

      expect(MockNodeSDK).toHaveBeenCalledOnce();
      const [[ctorArg]] = MockNodeSDK.mock.calls as [[{ resource: unknown; traceExporter: unknown }]];
      expect(ctorArg).toHaveProperty('resource');
      expect(ctorArg).toHaveProperty('traceExporter');
    });

    it('shutdownTracer() calls sdk.shutdown() on the initialized instance', async () => {
      vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://collector:4318');
      vi.resetModules();
      const { initTracer, shutdownTracer } = await import('../tracer.js');

      initTracer('svc');
      await shutdownTracer();

      expect(mockShutdown).toHaveBeenCalledOnce();
    });

    it('registers a SIGTERM listener when initialized', async () => {
      vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://collector:4318');
      vi.resetModules();
      const { initTracer } = await import('../tracer.js');

      const listenersBefore = process.listenerCount('SIGTERM');
      initTracer('svc');

      expect(process.listenerCount('SIGTERM')).toBe(listenersBefore + 1);
    });
  });
});

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
