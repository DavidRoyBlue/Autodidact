import { describe, it, expect, vi, beforeEach } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────
// Mock @autodidact/db
// ────────────────────────────────────────────────────────────────────────────

const mockTxUpdate = vi.fn();
const mockTxUpdateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
const mockTxInsert = vi.fn();
// tx.insert(modules).values(rows).returning(...) → inserted rows (with ids)
const mockTxInsertValues = vi.fn().mockReturnValue({
  returning: vi.fn().mockResolvedValue([]),
});
const mockTxDelete = vi.fn();

const mockUpdate = vi.fn();
const mockUpdateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
const mockInsert = vi.fn();
const mockInsertValues = vi.fn().mockResolvedValue(undefined);

const mockTransaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
  const tx = {
    update: mockTxUpdate,
    insert: mockTxInsert,
    delete: mockTxDelete,
  };
  mockTxUpdate.mockReturnValue({ set: mockTxUpdateSet });
  mockTxInsert.mockReturnValue({ values: mockTxInsertValues });
  mockTxDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  return fn(tx);
});

vi.mock('@autodidact/db', () => ({
  getDb: vi.fn(() => ({
    update: mockUpdate,
    insert: mockInsert,
    transaction: mockTransaction,
  })),
  courses: {},
  modules: {},
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  sql: vi.fn((s: TemplateStringsArray, ...v: unknown[]) => ({ sql: s, v })),
}));

const { processCourseGeneration } = await import(
  '../processors/course-generation.processor.js'
);

// ────────────────────────────────────────────────────────────────────────────

const course = {
  title: 'Python Basics',
  description: 'Learn Python',
  difficulty: 'beginner' as const,
  budget: { estimated_minutes: 105 },
  modules: [
    {
      position: 1,
      title: 'Intro',
      description: 'Getting started',
      objectives: ['Understand Python'],
      content: '## Setup\nInstall.',
      estimated_minutes: 60,
      resources: [],
    },
    {
      position: 2,
      title: 'Variables',
      description: 'Types and vars',
      objectives: ['Use variables'],
      content: '## Types\nint, str.',
      estimated_minutes: 45,
      resources: [{ url: 'https://docs.python.org/3/', title: 'Python docs', why: 'the reference' }],
    },
  ],
};

const jobData = {
  courseId: 'course-1',
  userId: 'user-1',
  topic: 'Python',
  difficulty: 'beginner' as const,
  timeBudget: '1h' as const,
};

function makePlatformClient(generated = course) {
  return { generateCourse: vi.fn().mockResolvedValue(generated) };
}

function makeQueueProvider() {
  return { enqueue: vi.fn().mockResolvedValue('emb-task-1'), close: vi.fn() };
}

function makeLogger() {
  return { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
}

function makeDeps(platform = makePlatformClient(), queue = makeQueueProvider()) {
  return {
    platformClient: platform as never,
    agentClient: { generateEmbedding: vi.fn() } as never,
    queueProvider: queue as never,
    logger: makeLogger() as never,
  };
}

describe('processCourseGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockInsert.mockReturnValue({ values: mockInsertValues });
    mockUpdateSet.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    mockTxUpdateSet.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    mockTxInsertValues.mockReturnValue({ returning: vi.fn().mockResolvedValue([]) });
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      mockTxUpdate.mockReturnValue({ set: mockTxUpdateSet });
      mockTxInsert.mockReturnValue({ values: mockTxInsertValues });
      mockTxDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
      return fn({ update: mockTxUpdate, insert: mockTxInsert, delete: mockTxDelete });
    });
  });

  it('updates course status to "generating" before calling the platform', async () => {
    const setCapture: Record<string, unknown>[] = [];
    mockUpdateSet.mockImplementation((data: Record<string, unknown>) => {
      setCapture.push(data);
      return { where: vi.fn().mockResolvedValue(undefined) };
    });

    await processCourseGeneration(jobData, makeDeps());
    expect(setCapture[0]?.['status']).toBe('generating');
  });

  it('calls platformClient.generateCourse with the job data', async () => {
    const platform = makePlatformClient();
    await processCourseGeneration(jobData, makeDeps(platform));
    expect(platform.generateCourse).toHaveBeenCalledWith(jobData);
  });

  it('inserts every module, 0-indexed, with its lesson and resources, inside the transaction', async () => {
    await processCourseGeneration(jobData, makeDeps());
    expect(mockTxInsertValues).toHaveBeenCalledOnce();
    const rows = mockTxInsertValues.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(rows.map((r) => r['position'])).toEqual([0, 1]);
    expect(rows[1]).toMatchObject({
      content: '## Types\nint, str.',
      resources: course.modules[1]?.resources,
      estimatedMinutes: 45,
    });
  });

  it('updates course status to "ready" with the measured hours inside the transaction', async () => {
    const txSetCalls: Record<string, unknown>[] = [];
    mockTxUpdateSet.mockImplementation((data: Record<string, unknown>) => {
      txSetCalls.push(data);
      return { where: vi.fn().mockResolvedValue(undefined) };
    });

    await processCourseGeneration(jobData, makeDeps());
    expect(txSetCalls[0]).toMatchObject({ status: 'ready', estimatedHours: 2 });
  });

  it('enqueues an embedding task after successful generation', async () => {
    const queue = makeQueueProvider();
    await processCourseGeneration(jobData, makeDeps(makePlatformClient(), queue));
    expect(queue.enqueue).toHaveBeenCalledOnce();
    expect(queue.enqueue).toHaveBeenCalledWith('embedding', 'generate-embedding', {
      courseId: jobData.courseId,
      topic: jobData.topic,
    });
  });

  it('propagates a platform failure without enqueueing the embedding task', async () => {
    const platform = makePlatformClient();
    platform.generateCourse.mockRejectedValue(new Error('platform down'));
    const queue = makeQueueProvider();

    await expect(processCourseGeneration(jobData, makeDeps(platform, queue))).rejects.toThrow(
      'platform down',
    );
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
