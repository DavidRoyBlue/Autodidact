import { randomUUID } from 'node:crypto';
import type { EnqueueOptions, IQueueProvider } from '../../interfaces/queue.js';

export interface LoopbackProviderConfig {
  /** Base URL of the worker service, e.g. http://localhost:3002 */
  workerBaseUrl: string;
}

/**
 * Local-development IQueueProvider: enqueue fires an HTTP POST straight to
 * the worker's task endpoint (the same `/tasks/:name` contract Cloud Tasks
 * invokes in production) and returns immediately. No queue server, no Redis.
 *
 * Single attempt, no retries — the worker treats a request without the
 * Cloud Tasks retry-count header as the final attempt.
 */
export class LoopbackQueueProvider implements IQueueProvider {
  constructor(private readonly config: LoopbackProviderConfig) {}

  async enqueue<T>(
    queue: string,
    name: string,
    data: T,
    _opts?: EnqueueOptions,
  ): Promise<string> {
    const taskId = `loopback-${queue}-${randomUUID()}`;

    // Fire-and-forget: the caller must not block on job completion.
    void fetch(`${this.config.workerBaseUrl}/tasks/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).catch((err: unknown) => {
      // eslint-disable-next-line no-console -- dev-only provider; no logger dependency in this package
      console.error(`[loopback-queue] task ${taskId} (${name}) failed to dispatch:`, err);
    });

    return taskId;
  }

  async close(): Promise<void> {
    // No connections to release.
  }
}
