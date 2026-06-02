import { isRetryableError } from './llm/resilient-invoke.js';

export type ClientErrorCode =
  | 'timeout'
  | 'rate_limited'
  | 'upstream_unavailable'
  | 'invalid_request'
  | 'cancelled'
  | 'internal';

export interface ErrorEvent {
  type: 'error';
  code: ClientErrorCode;
  message: string;
}

const SAFE_MESSAGES: Record<ClientErrorCode, string> = {
  timeout: 'The request timed out. Please try again.',
  rate_limited: 'The service is busy right now. Please retry in a moment.',
  upstream_unavailable: 'An upstream service is temporarily unavailable. Please try again.',
  invalid_request: 'The request was invalid.',
  cancelled: 'The request was cancelled.',
  internal: 'An unexpected error occurred.',
};

function classify(err: unknown): ClientErrorCode {
  if (!err || typeof err !== 'object') return 'internal';
  const e = err as {
    status?: number;
    response?: { status?: number };
    name?: string;
    message?: string;
  };

  if (e.name === 'AbortError' || /\baborted\b/i.test(e.message ?? '')) return 'cancelled';
  if (/timed out|timeout/i.test(e.message ?? '') || /timeout/i.test(e.name ?? '')) {
    return 'timeout';
  }

  const status = e.status ?? e.response?.status;
  if (status === 429) return 'rate_limited';
  if (typeof status === 'number' && status >= 400 && status < 500) return 'invalid_request';
  if (isRetryableError(err)) return 'upstream_unavailable';

  return 'internal';
}

/**
 * Map any thrown error to a safe, structured client error event. The client
 * receives a stable `code` and a generic `message` only — never raw error text,
 * which can leak connection strings, stack traces, or upstream internals. Full
 * detail must be logged server-side by the caller.
 */
export function toErrorEvent(err: unknown): ErrorEvent {
  const code = classify(err);
  return { type: 'error', code, message: SAFE_MESSAGES[code] };
}
