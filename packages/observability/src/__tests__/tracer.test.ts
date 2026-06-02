import { describe, it, expect, vi, afterEach } from 'vitest';

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
