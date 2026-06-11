import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LoopbackQueueProvider } from '../implementations/queue/loopback.provider.js';

describe('LoopbackQueueProvider', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('POSTs the payload to the worker task endpoint', async () => {
    const provider = new LoopbackQueueProvider({ workerBaseUrl: 'http://localhost:3002' });
    await provider.enqueue('course-generation', 'generate-course', { courseId: 'c1' });

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3002/tasks/generate-course', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId: 'c1' }),
    });
  });

  it('returns a synthetic task id immediately', async () => {
    const provider = new LoopbackQueueProvider({ workerBaseUrl: 'http://localhost:3002' });
    const id = await provider.enqueue('embedding', 'generate-embedding', { courseId: 'c1' });
    expect(id).toMatch(/^loopback-embedding-/);
  });

  it('does not reject when the dispatch fails (fire-and-forget)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error('connection refused'));
    const provider = new LoopbackQueueProvider({ workerBaseUrl: 'http://localhost:3002' });

    await expect(
      provider.enqueue('embedding', 'generate-embedding', { courseId: 'c1' }),
    ).resolves.toMatch(/^loopback-/);

    // Let the rejected fetch promise settle so the catch handler runs.
    await new Promise((resolve) => setImmediate(resolve));
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('close() resolves without error', async () => {
    const provider = new LoopbackQueueProvider({ workerBaseUrl: 'http://localhost:3002' });
    await expect(provider.close()).resolves.toBeUndefined();
  });
});
