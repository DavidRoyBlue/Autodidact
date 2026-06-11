import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BullMQQueueProvider } from '../implementations/queue/bullmq.provider.js';

// ────────────────────────────────────────────────────────────────────────────
// Mock ioredis and bullmq before importing the provider under test
// ────────────────────────────────────────────────────────────────────────────

const { mockQuit, mockQueueAdd, mockQueueGetJob, mockQueueClose, MockQueue } = vi.hoisted(() => {
  const mockQuit = vi.fn().mockResolvedValue(undefined);
  const mockQueueAdd = vi.fn().mockImplementation(async () => ({ id: 'job-123' }));
  const mockQueueGetJob = vi.fn(); // implementation set per-test in beforeEach
  const mockQueueClose = vi.fn().mockResolvedValue(undefined);
  const MockQueue = vi.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    getJob: mockQueueGetJob,
    close: mockQueueClose,
  }));
  return { mockQuit, mockQueueAdd, mockQueueGetJob, mockQueueClose, MockQueue };
});

vi.mock('ioredis', () => {
  const RedisMock = vi.fn().mockImplementation(() => ({ quit: mockQuit }));
  return { Redis: RedisMock, default: RedisMock };
});

vi.mock('bullmq', () => ({ Queue: MockQueue }));

// ────────────────────────────────────────────────────────────────────────────

describe('BullMQQueueProvider', () => {
  let mockJobGetState: ReturnType<typeof vi.fn>;
  let mockJob: { id: string; getState: ReturnType<typeof vi.fn> } | null;
  let provider: InstanceType<typeof BullMQQueueProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJobGetState = vi.fn().mockResolvedValue('waiting');
    mockJob = { id: 'job-123', getState: mockJobGetState };
    mockQueueGetJob.mockImplementation(async () => mockJob);
    provider = new BullMQQueueProvider({ redisUrl: 'redis://localhost:6379' });
  });

  describe('queue caching (getQueue)', () => {
    it('creates a Queue with the correct name on the first call', async () => {
      await provider.enqueue('my-queue', 'job-name', { data: 1 });
      expect(MockQueue).toHaveBeenCalledWith('my-queue', expect.any(Object));
    });

    it('returns the same Queue instance on subsequent calls with the same name', async () => {
      await provider.enqueue('my-queue', 'job-a', {});
      await provider.enqueue('my-queue', 'job-b', {});
      expect(MockQueue).toHaveBeenCalledTimes(1);
    });

    it('creates different Queue instances for different names', async () => {
      await provider.enqueue('queue-a', 'job', {});
      await provider.enqueue('queue-b', 'job', {});
      expect(MockQueue).toHaveBeenCalledTimes(2);
    });
  });

  describe('enqueue()', () => {
    it('calls queue.add with name and data', async () => {
      await provider.enqueue('q', 'my-job', { payload: 'data' });
      expect(mockQueueAdd).toHaveBeenCalledWith('my-job', { payload: 'data' }, expect.any(Object));
    });

    it('applies default 3 attempts when no opts provided', async () => {
      await provider.enqueue('q', 'my-job', {});
      const opts = mockQueueAdd.mock.calls[0][2] as Record<string, unknown>;
      expect(opts['attempts']).toBe(3);
    });

    it('applies exponential backoff with 5000ms delay by default', async () => {
      await provider.enqueue('q', 'my-job', {});
      const opts = mockQueueAdd.mock.calls[0][2] as Record<string, unknown>;
      const backoff = opts['backoff'] as Record<string, unknown>;
      expect(backoff['type']).toBe('exponential');
      expect(backoff['delay']).toBe(5000);
    });

    it('passes through custom attempts when provided', async () => {
      await provider.enqueue('q', 'my-job', {}, { attempts: 5 });
      const opts = mockQueueAdd.mock.calls[0][2] as Record<string, unknown>;
      expect(opts['attempts']).toBe(5);
    });

    it('returns job.id as string', async () => {
      const id = await provider.enqueue('q', 'my-job', {});
      expect(id).toBe('job-123');
    });

    it('returns empty string when job.id is undefined', async () => {
      mockQueueAdd.mockResolvedValueOnce({ id: undefined });
      const id = await provider.enqueue('q', 'my-job', {});
      expect(id).toBe('');
    });
  });

  describe('getJobStatus()', () => {
    const states: [string, string][] = [
      ['waiting', 'pending'],
      ['active', 'active'],
      ['completed', 'completed'],
      ['failed', 'failed'],
      ['delayed', 'delayed'],
      ['paused', 'pending'],
      ['unknown', 'failed'],
    ];

    for (const [bullmqState, expectedStatus] of states) {
      it(`maps "${bullmqState}" state → "${expectedStatus}"`, async () => {
        mockJobGetState = vi.fn().mockResolvedValue(bullmqState);
        mockJob = { id: 'j1', getState: mockJobGetState };
        const status = await provider.getJobStatus('q', 'j1');
        expect(status).toBe(expectedStatus);
      });
    }

    it('returns "failed" when job is not found (getJob returns null)', async () => {
      mockJob = null;
      const status = await provider.getJobStatus('q', 'missing-job');
      expect(status).toBe('failed');
    });
  });

  describe('close()', () => {
    it('closes all queues and the Redis connection', async () => {
      await provider.enqueue('q1', 'job', {});
      await provider.close();
      expect(mockQueueClose).toHaveBeenCalled();
      expect(mockQuit).toHaveBeenCalled();
    });
  });
});
