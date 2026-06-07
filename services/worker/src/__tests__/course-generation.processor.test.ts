import { describe, it, expect, vi, beforeEach } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────
// Capture the BullMQ Worker processor function
// ────────────────────────────────────────────────────────────────────────────

let capturedProcessorFn: ((job: Record<string, unknown>) => Promise<void>) | undefined;

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation((_queue: string, fn: (job: unknown) => Promise<void>) => {
    capturedProcessorFn = fn as (job: Record<string, unknown>) => Promise<void>;
    return { close: vi.fn() };
  }),
}));

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

const mockUpdate = vi.fn();
const mockUpdateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
const mockInsert = vi.fn();
const mockInsertValues = vi.fn().mockResolvedValue(undefined);

const mockTransaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
  const tx = {
    update: mockTxUpdate,
    insert: mockTxInsert,
  };
  mockTxUpdate.mockReturnValue({ set: mockTxUpdateSet });
  mockTxInsert.mockReturnValue({ values: mockTxInsertValues });
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

const { createCourseGenerationWorker } = await import('../processors/course-generation.processor.js');

// ────────────────────────────────────────────────────────────────────────────

const blueprint = {
  title: 'Python Basics',
  description: 'Learn Python',
  difficulty: 'beginner',
  estimatedHours: 10,
  modules: [
    {
      position: 0,
      title: 'Intro',
      description: 'Getting started',
      objectives: ['Understand Python'],
      contentOutline: [{ title: 'Setup', points: ['Install'] }],
      estimatedMinutes: 60,
    },
    {
      position: 1,
      title: 'Variables',
      description: 'Types and vars',
      objectives: ['Use variables'],
      contentOutline: [{ title: 'Types', points: ['int', 'str'] }],
      estimatedMinutes: 45,
    },
  ],
};

const jobData = {
  courseId: 'course-1',
  userId: 'user-1',
  topic: 'Python',
  difficulty: 'beginner' as const,
  moduleCount: 5,
};

function makeAgentClient(bp = blueprint) {
  return { generateCourse: vi.fn().mockResolvedValue(bp), generateEmbedding: vi.fn() };
}

function makeQueueProvider() {
  return { enqueue: vi.fn().mockResolvedValue('emb-job-1'), getJobStatus: vi.fn(), close: vi.fn() };
}

function makeLogger() {
  return { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
}

describe('createCourseGenerationWorker — processor function', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessorFn = undefined;
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockInsert.mockReturnValue({ values: mockInsertValues });
    mockUpdateSet.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    mockTxUpdateSet.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    mockTxInsertValues.mockReturnValue({ returning: vi.fn().mockResolvedValue([]) });
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      mockTxUpdate.mockReturnValue({ set: mockTxUpdateSet });
      mockTxInsert.mockReturnValue({ values: mockTxInsertValues });
      return fn({ update: mockTxUpdate, insert: mockTxInsert });
    });
  });

  it('updates course status to "generating" before calling agent', async () => {
    const agent = makeAgentClient();
    createCourseGenerationWorker({} as never, agent as never, makeQueueProvider() as never, makeLogger() as never);
    expect(capturedProcessorFn).toBeDefined();

    const setCapture: Record<string, unknown>[] = [];
    mockUpdateSet.mockImplementation((data: Record<string, unknown>) => {
      setCapture.push(data);
      return { where: vi.fn().mockResolvedValue(undefined) };
    });

    await capturedProcessorFn!({ data: jobData });
    expect(setCapture[0]?.['status']).toBe('generating');
  });

  it('calls agentClient.generateCourse with the job data', async () => {
    const agent = makeAgentClient();
    createCourseGenerationWorker({} as never, agent as never, makeQueueProvider() as never, makeLogger() as never);
    await capturedProcessorFn!({ data: jobData });
    expect(agent.generateCourse).toHaveBeenCalledWith({
      courseId: jobData.courseId,
      userId: jobData.userId,
      topic: jobData.topic,
      difficulty: jobData.difficulty,
      moduleCount: jobData.moduleCount,
    });
  });

  it('inserts all module rows from the blueprint inside the transaction', async () => {
    const agent = makeAgentClient();
    createCourseGenerationWorker({} as never, agent as never, makeQueueProvider() as never, makeLogger() as never);
    await capturedProcessorFn!({ data: jobData });
    // modules inserted via tx.insert(modules).values(moduleRows)
    expect(mockTxInsertValues).toHaveBeenCalledOnce();
    const insertedRows = mockTxInsertValues.mock.calls[0]?.[0] as unknown[];
    expect(insertedRows).toHaveLength(blueprint.modules.length);
  });

  it('updates course status to "ready" inside the transaction', async () => {
    const agent = makeAgentClient();
    createCourseGenerationWorker({} as never, agent as never, makeQueueProvider() as never, makeLogger() as never);

    const txSetCalls: Record<string, unknown>[] = [];
    mockTxUpdateSet.mockImplementation((data: Record<string, unknown>) => {
      txSetCalls.push(data);
      return { where: vi.fn().mockResolvedValue(undefined) };
    });

    await capturedProcessorFn!({ data: jobData });
    expect(txSetCalls[0]?.['status']).toBe('ready');
  });

  it('enqueues an embedding job after successful generation', async () => {
    const agent = makeAgentClient();
    const queue = makeQueueProvider();
    createCourseGenerationWorker({} as never, agent as never, queue as never, makeLogger() as never);
    await capturedProcessorFn!({ data: jobData });
    expect(queue.enqueue).toHaveBeenCalledOnce();
    expect(queue.enqueue).toHaveBeenCalledWith(
      'embedding',
      'generate-embedding',
      { courseId: jobData.courseId, topic: jobData.topic },
      expect.any(Object),
    );
  });
});
