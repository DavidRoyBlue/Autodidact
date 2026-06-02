import { describe, it, expect, vi } from 'vitest';
import { createShutdownHandler } from '../shutdown.js';

describe('createShutdownHandler', () => {
  it('calls close() on every worker', async () => {
    const w1 = { close: vi.fn().mockResolvedValue(undefined) };
    const w2 = { close: vi.fn().mockResolvedValue(undefined) };
    const queueProvider = { close: vi.fn().mockResolvedValue(undefined), enqueue: vi.fn(), getJobStatus: vi.fn() };
    const redis = { disconnect: vi.fn() };

    const handler = createShutdownHandler({
      workers: [w1, w2] as never,
      queueProvider: queueProvider as never,
      redis: redis as never,
    });

    await handler();

    expect(w1.close).toHaveBeenCalledOnce();
    expect(w2.close).toHaveBeenCalledOnce();
  });

  it('calls queueProvider.close()', async () => {
    const queueProvider = { close: vi.fn().mockResolvedValue(undefined), enqueue: vi.fn(), getJobStatus: vi.fn() };
    const redis = { disconnect: vi.fn() };

    const handler = createShutdownHandler({
      workers: [],
      queueProvider: queueProvider as never,
      redis: redis as never,
    });

    await handler();

    expect(queueProvider.close).toHaveBeenCalledOnce();
  });

  it('calls redis.disconnect()', async () => {
    const queueProvider = { close: vi.fn().mockResolvedValue(undefined), enqueue: vi.fn(), getJobStatus: vi.fn() };
    const redis = { disconnect: vi.fn() };

    const handler = createShutdownHandler({
      workers: [],
      queueProvider: queueProvider as never,
      redis: redis as never,
    });

    await handler();

    expect(redis.disconnect).toHaveBeenCalledOnce();
  });

  it('resolves (does not reject) when all deps close successfully', async () => {
    const queueProvider = { close: vi.fn().mockResolvedValue(undefined), enqueue: vi.fn(), getJobStatus: vi.fn() };
    const redis = { disconnect: vi.fn() };

    const handler = createShutdownHandler({
      workers: [],
      queueProvider: queueProvider as never,
      redis: redis as never,
    });

    await expect(handler()).resolves.toBeUndefined();
  });

  it('closes workers and queue provider concurrently (all called even if one is slow)', async () => {
    const callOrder: string[] = [];
    const w1 = {
      close: vi.fn().mockImplementation(async () => {
        callOrder.push('w1-start');
        await Promise.resolve();
        callOrder.push('w1-end');
      }),
    };
    const w2 = {
      close: vi.fn().mockImplementation(async () => {
        callOrder.push('w2-start');
        await Promise.resolve();
        callOrder.push('w2-end');
      }),
    };
    const queueProvider = {
      close: vi.fn().mockImplementation(async () => {
        callOrder.push('queue-start');
        await Promise.resolve();
        callOrder.push('queue-end');
      }),
      enqueue: vi.fn(),
      getJobStatus: vi.fn(),
    };
    const redis = { disconnect: vi.fn() };

    const handler = createShutdownHandler({
      workers: [w1, w2] as never,
      queueProvider: queueProvider as never,
      redis: redis as never,
    });

    await handler();

    // All three start before any end (concurrent, not sequential)
    expect(callOrder.slice(0, 3).sort()).toEqual(['queue-start', 'w1-start', 'w2-start']);
    expect(callOrder.slice(3, 6).sort()).toEqual(['queue-end', 'w1-end', 'w2-end']);
  });
});
