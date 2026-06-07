import type { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { IQueueProvider } from '@autodidact/providers';

export interface ShutdownDeps {
  workers: Worker[];
  queueProvider: IQueueProvider;
  redis: Redis;
}

/**
 * Returns an async shutdown function that drains all workers, closes the queue
 * provider, and disconnects the Redis client. Does NOT call process.exit —
 * that is the caller's (main.ts) responsibility, enabling unit-testing of
 * shutdown semantics without spawning a subprocess.
 */
export function createShutdownHandler(deps: ShutdownDeps): () => Promise<void> {
  return async () => {
    await Promise.all([...deps.workers.map((w) => w.close()), deps.queueProvider.close()]);
    deps.redis.disconnect();
  };
}
