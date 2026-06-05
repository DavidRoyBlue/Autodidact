import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api';

let sdk: NodeSDK | null = null;

const TRACER_NAME = 'autodidact';

export function initTracer(serviceName: string): void {
  const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
  if (!endpoint) return;

  sdk = new NodeSDK({
    resource: new Resource({ [ATTR_SERVICE_NAME]: serviceName }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
  });

  sdk.start();

  process.on('SIGTERM', async () => {
    await sdk?.shutdown();
  });
}

export async function shutdownTracer(): Promise<void> {
  await sdk?.shutdown();
}

/**
 * Run `fn` inside an OpenTelemetry span named `name`. Records the result status,
 * captures exceptions, and always ends the span. Transparent: returns whatever
 * `fn` returns and re-throws whatever it throws.
 *
 * When no SDK is active (`initTracer` not called / `OTEL_EXPORTER_OTLP_ENDPOINT`
 * unset) the global tracer is a no-op, so this adds negligible overhead and is
 * safe to wrap around every graph node unconditionally.
 */
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  attributes: Attributes = {},
): Promise<T> {
  const tracer = trace.getTracer(TRACER_NAME);
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttributes(attributes);
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Attach attributes to the currently-active span (e.g. token usage discovered
 * mid-execution). No-op when there is no active span.
 */
export function setSpanAttributes(attributes: Attributes): void {
  trace.getActiveSpan()?.setAttributes(attributes);
}

/**
 * Whether LangSmith tracing is enabled via environment. LangChain/LangGraph emit
 * traces automatically when `LANGCHAIN_TRACING_V2` (or the newer
 * `LANGSMITH_TRACING`) is `true` and an API key is present — this helper only
 * reports the flag so the service can log its tracing posture at startup.
 */
export function isLangSmithTracingEnabled(): boolean {
  return (
    process.env['LANGCHAIN_TRACING_V2'] === 'true' ||
    process.env['LANGSMITH_TRACING'] === 'true'
  );
}
