import { withSpan, setSpanAttributes, type Logger } from '@autodidact/observability';

/**
 * State keys that are cheap, non-sensitive, and useful to surface per node run.
 * Logged/attached as span attributes when present on a node's returned partial
 * state. Token usage and model name are recorded separately by the resilient LLM
 * invocation wrapper (it owns the response object).
 */
const SIGNAL_KEYS = [
  'completionSignaled',
  'completionScore',
  'teachingPhase',
  'retryCount',
] as const;

/**
 * Wrap a LangGraph node so every execution opens a `graph.node.<name>` span and
 * emits a structured log line with latency and known state signals. Transparent:
 * the wrapped node's input/output/throw behavior is unchanged.
 *
 * `logger` is optional so node unit tests can exercise the raw node directly;
 * the graph builders pass the service logger.
 */
export function instrumentNode<S>(
  nodeName: string,
  fn: (state: S) => Promise<Partial<S>>,
  logger?: Logger,
): (state: S) => Promise<Partial<S>> {
  return (state: S) =>
    withSpan(
      `graph.node.${nodeName}`,
      async () => {
        const start = performance.now();
        try {
          const result = await fn(state);
          const latencyMs = Math.round(performance.now() - start);

          const signals: Record<string, unknown> = {};
          for (const key of SIGNAL_KEYS) {
            if (result && key in result) {
              signals[key] = (result as Record<string, unknown>)[key];
            }
          }

          setSpanAttributes({
            'graph.node': nodeName,
            'graph.node.latency_ms': latencyMs,
          });
          logger?.info(
            { node: nodeName, latencyMs, ...signals },
            'graph node completed',
          );
          return result;
        } catch (err) {
          logger?.error({ node: nodeName, err }, 'graph node failed');
          throw err;
        }
      },
      { 'graph.node': nodeName },
    );
}
