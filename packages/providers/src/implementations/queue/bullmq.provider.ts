import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { IQueueProvider, EnqueueOptions } from '../../interfaces/queue.js';
import type { JobStatus } from '@autodidact/types';

export class BullMQQueueProvider implements IQueueProvider {
  private readonly connection: Redis;
  private readonly queues = new Map<string, Queue>();

  constructor(config: { redisUrl: string }) {
    this.connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  }

  private getQueue(name: string): Queue {
    if (!this.queues.has(name)) {
      this.queues.set(name, new Queue(name, { connection: this.connection }));
    }
    return this.queues.get(name)!;
  }

  async enqueue<T>(
    queue: string,
    name: string,
    data: T,
    opts?: EnqueueOptions,
  ): Promise<string> {
    const q = this.getQueue(queue);
    const job = await q.add(name, data, {
      attempts: opts?.attempts ?? 3,
      backoff: opts?.backoff ?? { type: 'exponential', delay: 5000 },
      delay: opts?.delay,
      jobId: opts?.jobId,
    });
    return job.id ?? '';
  }

  async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    await this.connection.quit();
  }

  async getJobStatus(queue: string, jobId: string): Promise<JobStatus> {
    const q = this.getQueue(queue);
    const job = await q.getJob(jobId);
    if (!job) return 'failed';
    const state = await job.getState();
    const map: Record<string, JobStatus> = {
      waiting: 'pending',
      active: 'active',
      completed: 'completed',
      failed: 'failed',
      delayed: 'delayed',
      paused: 'pending',
      unknown: 'failed',
    };
    return map[state] ?? 'pending';
  }
}
