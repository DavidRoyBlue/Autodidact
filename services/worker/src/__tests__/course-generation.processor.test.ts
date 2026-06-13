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
  return { enqueue: vi.fn().mockResolvedValue('emb-task-1'), close: vi.fn() };
}

function makeLogger() {
  return { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
}

function makeDeps(agent = makeAgentClient(), queue = makeQueueProvider()) {
  return {
    agentClient: agent as never,
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

  it('updates course status to "generating" before calling agent', async () => {
    const setCapture: Record<string, unknown>[] = [];
    mockUpdateSet.mockImplementation((data: Record<string, unknown>) => {
      setCapture.push(data);
      return { where: vi.fn().mockResolvedValue(undefined) };
    });

    await processCourseGeneration(jobData, makeDeps());
    expect(setCapture[0]?.['status']).toBe('generating');
  });

  it('calls agentClient.generateCourse with the job data', async () => {
    const agent = makeAgentClient();
    await processCourseGeneration(jobData, makeDeps(agent));
    expect(agent.generateCourse).toHaveBeenCalledWith({
      courseId: jobData.courseId,
      userId: jobData.userId,
      topic: jobData.topic,
      difficulty: jobData.difficulty,
      moduleCount: jobData.moduleCount,
    });
  });

  it('inserts all module rows from the blueprint inside the transaction', async () => {
    await processCourseGeneration(jobData, makeDeps());
    // modules inserted via tx.insert(modules).values(moduleRows)
    expect(mockTxInsertValues).toHaveBeenCalledOnce();
    const insertedRows = mockTxInsertValues.mock.calls[0]?.[0] as unknown[];
    expect(insertedRows).toHaveLength(blueprint.modules.length);
  });

  it('updates course status to "ready" inside the transaction', async () => {
    const txSetCalls: Record<string, unknown>[] = [];
    mockTxUpdateSet.mockImplementation((data: Record<string, unknown>) => {
      txSetCalls.push(data);
      return { where: vi.fn().mockResolvedValue(undefined) };
    });

    await processCourseGeneration(jobData, makeDeps());
    expect(txSetCalls[0]?.['status']).toBe('ready');
  });

  it('enqueues an embedding task after successful generation', async () => {
    const queue = makeQueueProvider();
    await processCourseGeneration(jobData, makeDeps(makeAgentClient(), queue));
    expect(queue.enqueue).toHaveBeenCalledOnce();
    expect(queue.enqueue).toHaveBeenCalledWith('embedding', 'generate-embedding', {
      courseId: jobData.courseId,
      topic: jobData.topic,
    });
  });

  it('propagates an agent failure without enqueueing the embedding task', async () => {
    const agent = makeAgentClient();
    agent.generateCourse.mockRejectedValue(new Error('agent down'));
    const queue = makeQueueProvider();

    await expect(processCourseGeneration(jobData, makeDeps(agent, queue))).rejects.toThrow(
      'agent down',
    );
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
