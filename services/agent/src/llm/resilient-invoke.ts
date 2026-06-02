import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { setSpanAttributes, type Logger } from '@autodidact/observability';

type ChatResponse = Awaited<ReturnType<BaseChatModel['invoke']>>;

export interface InvokeOptions {
  /** Caller cancellation (e.g. client disconnect). Aborting stops retries immediately. */
  signal?: AbortSignal;
  /** Per-attempt timeout. Defaults to 60s. */
  timeoutMs?: number;
  /** Total attempts including the first. Defaults to 3. */
  maxAttempts?: number;
  /** Base backoff delay; attempt N waits baseDelayMs * 2^(N-1). Defaults to 250ms. */
  baseDelayMs?: number;
  logger?: Logger;
  /** Graph node name, for log/span correlation. */
  node?: string;
  /** Model identifier, recorded on the span. */
  modelName?: string;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 250;
const MAX_BACKOFF_MS = 8_000;

const RETRYABLE_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'EPIPE',
]);

/**
 * Classify an error as a transient failure worth retrying: HTTP 429, any 5xx,
 * known transient network error codes, or SDK error names that denote
 * connection/timeout/rate-limit/server faults. Client errors (4xx other than
 * 429) and unknown errors are NOT retried.
 */
export function isRetryableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    status?: number;
    response?: { status?: number };
    code?: string;
    name?: string;
  };
  const status = e.status ?? e.response?.status;
  if (status === 429) return true;
  if (typeof status === 'number' && status >= 500) return true;
  if (e.code && RETRYABLE_CODES.has(e.code)) return true;
  if (e.name && /Connection|Timeout|InternalServer|RateLimit/i.test(e.name)) return true;
  return false;
}

function backoffMs(attempt: number, base: number): number {
  return Math.min(MAX_BACKOFF_MS, base * 2 ** (attempt - 1));
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('aborted'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error('aborted'));
      },
      { once: true },
    );
  });
}

/**
 * Invoke a chat model with a per-attempt timeout, bounded exponential-backoff
 * retry on transient failures, and caller-driven cancellation. Token usage and
 * model name are recorded as attributes on the active span (set by the node's
 * `instrumentNode` wrapper). This is the single LLM hot-path entry point for
 * graph nodes — call it instead of `model.invoke` directly.
 */
export async function invokeModel(
  model: BaseChatModel,
  messages: BaseMessage[],
  options: InvokeOptions = {},
): Promise<ChatResponse> {
  const {
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    logger,
    node,
    modelName,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw signal.reason ?? new Error('aborted');

    const timeoutController = new AbortController();
    const timer = setTimeout(
      () => timeoutController.abort(new Error(`LLM call timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    const composite = signal
      ? AbortSignal.any([signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await model.invoke(messages, { signal: composite });
      const usage = (response as { usage_metadata?: Record<string, number> }).usage_metadata;
      setSpanAttributes({
        'llm.attempts': attempt,
        ...(modelName ? { 'llm.model': modelName } : {}),
        ...(usage
          ? {
              'llm.tokens.input': usage['input_tokens'] ?? 0,
              'llm.tokens.output': usage['output_tokens'] ?? 0,
              'llm.tokens.total': usage['total_tokens'] ?? 0,
            }
          : {}),
      });
      return response;
    } catch (err) {
      lastError = err;
      // Caller aborted (client disconnect): never retry, surface immediately.
      if (signal?.aborted) throw err;
      const isLast = attempt >= maxAttempts;
      if (isLast || !isRetryableError(err)) throw err;
      logger?.warn(
        { node, attempt, err },
        'retryable LLM error; backing off before retry',
      );
      await delay(backoffMs(attempt, baseDelayMs), signal);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}
