import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentPlatformClient } from '../services/agent-platform.client.js';

const BASE_URL = 'http://platform:8400';
const job = { courseId: 'c-1', userId: 'u-1', topic: 'DNS', difficulty: 'intermediate' as const, timeBudget: '30min' as const };
const generated = {
  title: 'DNS',
  description: 'How names resolve.',
  difficulty: 'intermediate',
  budget: { preset: '30min', words: 4500, measured_words: 4400, estimated_minutes: 29 },
  modules: [
    {
      position: 1,
      title: 'The lookup',
      description: 'Who asks whom.',
      objectives: ['Trace a lookup'],
      content: '## The walk\nRoot, TLD, authoritative.',
      words: 4400,
      estimated_minutes: 29,
      resources: [],
    },
  ],
  review: { passed: true },
};

function response(body: unknown, status = 200) {
  return { ok: status < 400, status, json: vi.fn().mockResolvedValue(body), text: vi.fn().mockResolvedValue(JSON.stringify(body)) };
}

describe('AgentPlatformClient.generateCourse()', () => {
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

  it('creates a course-creator run with the word budget the preset implies, then polls it to completion', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ id: 'run_1', status: 'queued', output: null, error: null }))
      .mockResolvedValueOnce(response({ id: 'run_1', status: 'running', output: null, error: null }))
      .mockResolvedValueOnce(response({ id: 'run_1', status: 'completed', output: generated, error: null }));

    const pending = new AgentPlatformClient(BASE_URL).generateCourse(job);
    await vi.advanceTimersByTimeAsync(10_000);
    const course = await pending;

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${BASE_URL}/api/v1/runs`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: 'course-creator',
          input: { subject: 'DNS', difficulty: 'intermediate', budget: { preset: '30min', words: 4500 }, words_per_minute: 150 },
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, `${BASE_URL}/api/v1/runs/run_1`, expect.objectContaining({ method: 'GET' }));
    expect(course.modules[0]?.content).toBe('## The walk\nRoot, TLD, authoritative.');
    expect(course).not.toHaveProperty('review');
  });

  it('sends a null word budget for the unrestricted preset', async () => {
    fetchMock.mockResolvedValueOnce(response({ id: 'run_2', status: 'completed', output: generated, error: null }));
    fetchMock.mockResolvedValueOnce(response({ id: 'run_2', status: 'completed', output: generated, error: null }));
    await new AgentPlatformClient(BASE_URL).generateCourse({ ...job, timeBudget: 'unrestricted' });
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as { input: { budget: unknown } };
    expect(body.input.budget).toEqual({ preset: 'unrestricted', words: null });
  });

  it('throws with the run error when the run does not complete', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ id: 'run_3', status: 'queued', output: null, error: null }))
      .mockResolvedValueOnce(response({ id: 'run_3', status: 'failed', output: null, error: 'planner timed out' }));
    await expect(new AgentPlatformClient(BASE_URL).generateCourse(job)).rejects.toThrow('run_3 failed: planner timed out');
  });

  it('throws with the status when the platform rejects the request', async () => {
    fetchMock.mockResolvedValueOnce(response({ detail: 'unknown workflow' }, 404));
    await expect(new AgentPlatformClient(BASE_URL).generateCourse(job)).rejects.toThrow('POST /api/v1/runs failed: 404');
  });
});
