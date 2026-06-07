import { describe, it, expect, vi } from 'vitest';
import { invokeModel, isRetryableError } from '../llm/resilient-invoke.js';

function modelReturning(...outcomes: Array<{ ok: true; content: string } | { err: unknown }>) {
  const invoke = vi.fn();
  for (const outcome of outcomes) {
    if ('ok' in outcome) invoke.mockResolvedValueOnce({ content: outcome.content });
    else invoke.mockRejectedValueOnce(outcome.err);
  }
  return { invoke } as never;
}

describe('isRetryableError()', () => {
  it('treats HTTP 429 as retryable', () => {
    expect(isRetryableError({ status: 429 })).toBe(true);
  });
  it('treats HTTP 5xx as retryable', () => {
    expect(isRetryableError({ status: 503 })).toBe(true);
    expect(isRetryableError({ response: { status: 500 } })).toBe(true);
  });
  it('treats transient network error codes as retryable', () => {
    expect(isRetryableError({ code: 'ECONNRESET' })).toBe(true);
    expect(isRetryableError({ code: 'ETIMEDOUT' })).toBe(true);
  });
  it('treats HTTP 4xx (other than 429) as non-retryable', () => {
    expect(isRetryableError({ status: 400 })).toBe(false);
    expect(isRetryableError({ status: 401 })).toBe(false);
  });
  it('treats an unknown error as non-retryable', () => {
    expect(isRetryableError(new Error('nope'))).toBe(false);
  });
});

describe('invokeModel()', () => {
  it('returns the model response on success', async () => {
    const model = modelReturning({ ok: true, content: 'hello' });
    const res = await invokeModel(model, [], { baseDelayMs: 0 });
    expect(res).toEqual({ content: 'hello' });
  });

  it('passes the messages to the model', async () => {
    const model = modelReturning({ ok: true, content: 'x' });
    const messages = [{ _getType: () => 'human' }] as never;
    await invokeModel(model, messages, { baseDelayMs: 0 });
    expect((model as { invoke: ReturnType<typeof vi.fn> }).invoke.mock.calls[0]![0]).toBe(messages);
  });

  it('retries a retryable error and then succeeds', async () => {
    const model = modelReturning({ err: { status: 503 } }, { ok: true, content: 'recovered' });
    const res = await invokeModel(model, [], { baseDelayMs: 0, maxAttempts: 3 });
    expect(res).toEqual({ content: 'recovered' });
    expect((model as { invoke: ReturnType<typeof vi.fn> }).invoke).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable error', async () => {
    const model = modelReturning({ err: { status: 400 } });
    await expect(invokeModel(model, [], { baseDelayMs: 0 })).rejects.toMatchObject({ status: 400 });
    expect((model as { invoke: ReturnType<typeof vi.fn> }).invoke).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxAttempts on persistent retryable errors', async () => {
    const model = modelReturning({ err: { status: 503 } }, { err: { status: 503 } }, { err: { status: 503 } });
    await expect(invokeModel(model, [], { baseDelayMs: 0, maxAttempts: 3 })).rejects.toMatchObject({ status: 503 });
    expect((model as { invoke: ReturnType<typeof vi.fn> }).invoke).toHaveBeenCalledTimes(3);
  });

  it('does not retry once the caller signal is aborted', async () => {
    const controller = new AbortController();
    const invoke = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.reject({ status: 503 });
    });
    const model = { invoke } as never;
    await expect(
      invokeModel(model, [], { baseDelayMs: 0, maxAttempts: 3, signal: controller.signal }),
    ).rejects.toBeDefined();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('rejects with a timeout when the model call exceeds timeoutMs', async () => {
    // model.invoke respects the provided abort signal and rejects when aborted
    const invoke = vi.fn().mockImplementation((_m: unknown, opts: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        opts.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
    );
    const model = { invoke } as never;
    await expect(
      invokeModel(model, [], { timeoutMs: 10, maxAttempts: 1, baseDelayMs: 0 }),
    ).rejects.toThrow(/timed out|aborted/i);
  });
});
