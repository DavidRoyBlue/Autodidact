import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiPlatformClient } from '../services/agent-platform.client.js';

function response(body: unknown, status = 200) {
  return { ok: status < 400, status, json: vi.fn().mockResolvedValue(body), text: vi.fn().mockResolvedValue(JSON.stringify(body)) };
}

describe('ApiPlatformClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('creates a thread for the project and returns its id', async () => {
    fetchMock.mockResolvedValueOnce(response({ id: 'thr_9', title: 'module m', project: 'Autodidact', summary: '' }, 201));
    expect(await new ApiPlatformClient().createThread('module m')).toBe('thr_9');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8400/api/v1/threads',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'module m', project: 'Autodidact' }) }),
    );
  });

  it('runs course-teacher on the thread and polls until the reply is in', async () => {
    const reply = { reply: 'Hello.', module_complete: false, score: null };
    fetchMock
      .mockResolvedValueOnce(response({ id: 'run_1', status: 'queued', output: null, error: null }, 201))
      .mockResolvedValueOnce(response({ id: 'run_1', status: 'running', output: null, error: null }))
      .mockResolvedValueOnce(response({ id: 'run_1', status: 'completed', output: reply, error: null }));

    const pending = new ApiPlatformClient().teach('thr_9', 'hi');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await pending).toEqual(reply);
    expect(JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body)).toEqual({
      agent_id: 'course-teacher',
      thread_id: 'thr_9',
      input: { message: 'hi' },
    });
  });

  it('throws with the run error when the run does not complete', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ id: 'run_2', status: 'queued', output: null, error: null }, 201))
      .mockResolvedValueOnce(response({ id: 'run_2', status: 'cancelled', output: null, error: null }));
    await expect(new ApiPlatformClient().teach('thr_9', 'hi')).rejects.toThrow('run_2 cancelled: no error recorded');
  });

  it('rejects a reply off the teacher contract', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ id: 'run_3', status: 'queued', output: null, error: null }, 201))
      .mockResolvedValueOnce(response({ id: 'run_3', status: 'completed', output: { reply: 'no completion field' }, error: null }));
    await expect(new ApiPlatformClient().teach('thr_9', 'hi')).rejects.toThrow();
  });
});
