import { describe, it, expect, vi, beforeEach } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────
// Mock the processors — these tests cover HTTP semantics (validation, retry
// signalling, terminal-failure recovery), not processing logic.
// ────────────────────────────────────────────────────────────────────────────

const processCourseGenerationMock = vi.fn();
const processEmbeddingMock = vi.fn();

vi.mock('../processors/course-generation.processor.js', () => ({
  processCourseGeneration: processCourseGenerationMock,
}));
vi.mock('../processors/embedding.processor.js', () => ({
  processEmbedding: processEmbeddingMock,
}));

// Mock @autodidact/db for markCourseFailed
const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

vi.mock('@autodidact/db', () => ({
  getDb: vi.fn(() => ({ update: mockUpdate })),
  courses: { id: 'id-col', status: 'status-col' },
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  inArray: vi.fn((col: unknown, vals: unknown[]) => ({ inArray: [col, vals] })),
}));

const { buildApp } = await import('../app.js');

// ────────────────────────────────────────────────────────────────────────────

const validCoursePayload = {
  courseId: 'course-1',
  userId: 'user-1',
  topic: 'Python',
  difficulty: 'beginner',
  moduleCount: 5,
};

const validEmbeddingPayload = { courseId: 'course-1', topic: 'Python' };

function makeLogger() {
  return { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
}

function makeApp(maxAttempts = 3) {
  return buildApp({
    agentClient: {} as never,
    queueProvider: { enqueue: vi.fn(), close: vi.fn() } as never,
    logger: makeLogger() as never,
    maxAttempts,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  processCourseGenerationMock.mockResolvedValue(undefined);
  processEmbeddingMock.mockResolvedValue(undefined);
  mockUpdate.mockReturnValue({ set: mockUpdateSet });
  mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});

describe('POST /tasks/generate-course', () => {
  it('runs the processor and returns 204 on success', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/tasks/generate-course',
      payload: validCoursePayload,
    });
    expect(res.statusCode).toBe(204);
    expect(processCourseGenerationMock).toHaveBeenCalledWith(
      validCoursePayload,
      expect.objectContaining({ agentClient: expect.anything(), queueProvider: expect.anything() }),
    );
  });

  it('rejects an invalid payload with 400 without running the processor', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/tasks/generate-course',
      payload: { courseId: 'c-1' },
    });
    expect(res.statusCode).toBe(400);
    expect(processCourseGenerationMock).not.toHaveBeenCalled();
  });

  it('returns 500 (retry) when the processor fails on a non-final attempt', async () => {
    processCourseGenerationMock.mockRejectedValue(new Error('agent down'));
    const app = makeApp(3);
    const res = await app.inject({
      method: 'POST',
      url: '/tasks/generate-course',
      payload: validCoursePayload,
      headers: { 'x-cloudtasks-taskretrycount': '0' }, // first attempt of 3
    });
    expect(res.statusCode).toBe(500);
    expect(mockUpdate).not.toHaveBeenCalled(); // course NOT marked failed
  });

  it('marks the course failed and returns 200 on the final Cloud Tasks attempt', async () => {
    processCourseGenerationMock.mockRejectedValue(new Error('agent down'));
    const app = makeApp(3);
    const res = await app.inject({
      method: 'POST',
      url: '/tasks/generate-course',
      payload: validCoursePayload,
      headers: { 'x-cloudtasks-taskretrycount': '2' }, // 3rd and last attempt
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'failed' });
    // markCourseFailed ran: update().set({status:'failed'}).where(...)
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('treats a request without the retry header (loopback) as the final attempt', async () => {
    processCourseGenerationMock.mockRejectedValue(new Error('agent down'));
    const app = makeApp(3);
    const res = await app.inject({
      method: 'POST',
      url: '/tasks/generate-course',
      payload: validCoursePayload,
    });
    expect(res.statusCode).toBe(200);
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('still acknowledges the task when marking the course failed itself throws', async () => {
    processCourseGenerationMock.mockRejectedValue(new Error('agent down'));
    mockUpdateWhere.mockRejectedValue(new Error('db down'));
    const app = makeApp(3);
    const res = await app.inject({
      method: 'POST',
      url: '/tasks/generate-course',
      payload: validCoursePayload,
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /tasks/generate-embedding', () => {
  it('runs the processor and returns 204 on success', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/tasks/generate-embedding',
      payload: validEmbeddingPayload,
    });
    expect(res.statusCode).toBe(204);
    expect(processEmbeddingMock).toHaveBeenCalledWith(
      validEmbeddingPayload,
      expect.objectContaining({ agentClient: expect.anything() }),
    );
  });

  it('rejects an invalid payload with 400', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/tasks/generate-embedding',
      payload: { topic: 'Python' },
    });
    expect(res.statusCode).toBe(400);
    expect(processEmbeddingMock).not.toHaveBeenCalled();
  });

  it('returns 500 (retry) on a non-final attempt failure', async () => {
    processEmbeddingMock.mockRejectedValue(new Error('embed failed'));
    const app = makeApp(3);
    const res = await app.inject({
      method: 'POST',
      url: '/tasks/generate-embedding',
      payload: validEmbeddingPayload,
      headers: { 'x-cloudtasks-taskretrycount': '1' },
    });
    expect(res.statusCode).toBe(500);
  });

  it('acknowledges with 200 on the final attempt without touching course status', async () => {
    processEmbeddingMock.mockRejectedValue(new Error('embed failed'));
    const app = makeApp(3);
    const res = await app.inject({
      method: 'POST',
      url: '/tasks/generate-embedding',
      payload: validEmbeddingPayload,
      headers: { 'x-cloudtasks-taskretrycount': '2' },
    });
    expect(res.statusCode).toBe(200);
    // Embedding failure never flips course status — the course stays 'ready'.
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
