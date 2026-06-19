import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────
// Mock @autodidact/db before importing CoursesService
// ────────────────────────────────────────────────────────────────────────────

const {
  mockExecute,
  mockReturning,
  mockValues,
  mockInsert,
  mockSelect,
  mockFrom,
  mockWhere,
  mockOrderBy,
  mockOnConflictDoUpdate,
  mockOnConflictDoNothing,
  mockLimit,
} = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockReturning: vi.fn(),
  mockValues: vi.fn(),
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockOrderBy: vi.fn(),
  mockOnConflictDoUpdate: vi.fn(),
  mockOnConflictDoNothing: vi.fn(),
  mockLimit: vi.fn(),
}));

vi.mock('@autodidact/db', () => ({
  getDb: vi.fn().mockReturnValue({
    execute: mockExecute,
    insert: mockInsert,
    select: mockSelect,
  }),
  courses: {},
  modules: { courseId: {}, position: {} },
  enrollments: { userId: {}, courseId: {} },
  moduleProgress: {},
  users: { id: 'id' },
  eq: vi.fn((a, b) => ({ type: 'eq', a, b })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: 'sql',
    text: strings.join('?'),
    values,
  })),
}));

import { CoursesService } from '../modules/courses/courses.service.js';

// ────────────────────────────────────────────────────────────────────────────

function makeMockAgentClient(embedding: number[] = [0.1, 0.2, 0.3]) {
  return {
    generateEmbedding: vi.fn().mockResolvedValue(embedding),
  };
}

function makeMockQueueProvider(taskId = 'task-abc') {
  return {
    enqueue: vi.fn().mockResolvedValue(taskId),
    close: vi.fn(),
  };
}

function makeMockProvisioningService() {
  return { ensureProvisioned: vi.fn().mockResolvedValue(undefined) };
}

describe('CoursesService — slug generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: no similar course found
    mockExecute.mockResolvedValue({ rows: [] });

    // insert().values().returning() chain → returns new course id
    mockReturning.mockResolvedValue([{ id: 'new-course-id' }]);
    mockValues.mockReturnValue({ returning: mockReturning });
    mockInsert.mockReturnValue({ values: mockValues });

    // select chain (for enrollUser — not triggered in slug tests)
    mockOrderBy.mockResolvedValue([]);
    mockWhere.mockReturnValue({ orderBy: mockOrderBy, limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
  });

  const cases: [string, string][] = [
    ['Hello World', 'hello-world'],
    ['Python Basics!', 'python-basics'],
    ['  Leading & Trailing  ', 'leading-trailing'],
    ['Multiple   Spaces', 'multiple-spaces'],
    ['C++ Programming', 'c-programming'],
    ['Data Science 101', 'data-science-101'],
    ['Node.js & Express', 'node-js-express'],
    ['---leading dashes---', 'leading-dashes'],
    ['UPPER CASE', 'upper-case'],
    ['Special @#$% Chars', 'special-chars'],
  ];

  for (const [topic, expectedSlug] of cases) {
    it(`"${topic}" → slug "${expectedSlug}"`, async () => {
      const service = new CoursesService(
        makeMockAgentClient() as never,
        makeMockQueueProvider() as never,
        makeMockProvisioningService() as never,
      );
      await service.createOrReuse('user-1', {
        topic,
        difficulty: 'beginner',
        moduleCount: 5,
      });
      const insertCall = mockValues.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(insertCall?.['slug']).toBe(expectedSlug);
    });
  }
});

describe('CoursesService — createOrReuse routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // select chain for enrollUser
    mockOrderBy.mockResolvedValue([]);
    mockLimit.mockResolvedValue([]);
    mockWhere.mockReturnValue({ orderBy: mockOrderBy, limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    // insert chain — values() must expose all conflict-resolution methods
    mockOnConflictDoUpdate.mockResolvedValue(undefined);
    mockOnConflictDoNothing.mockResolvedValue(undefined);
    mockReturning.mockResolvedValue([{ id: 'new-course-id' }]);
    mockValues.mockReturnValue({
      returning: mockReturning,
      onConflictDoUpdate: mockOnConflictDoUpdate,
      onConflictDoNothing: mockOnConflictDoNothing,
    });
    mockInsert.mockReturnValue({ values: mockValues });
  });

  it('returns reused:true when a similar course is found', async () => {
    mockExecute.mockResolvedValue({ rows: [{ id: 'existing-course', title: 'Python', similarity: 0.95 }] });
    const queueProvider = makeMockQueueProvider();
    const service = new CoursesService(makeMockAgentClient() as never, queueProvider as never, makeMockProvisioningService() as never);
    const result = await service.createOrReuse('user-1', { topic: 'Python', difficulty: 'beginner', moduleCount: 5 });
    expect(result.reused).toBe(true);
    expect(result.courseId).toBe('existing-course');
    expect(queueProvider.enqueue).not.toHaveBeenCalled();
  });

  it('returns reused:false and enqueues a job when no similar course exists', async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    mockReturning.mockResolvedValue([{ id: 'new-course-id' }]);
    mockValues.mockReturnValue({ returning: mockReturning });
    mockInsert.mockReturnValue({ values: mockValues });
    const queueProvider = makeMockQueueProvider('task-xyz');
    const service = new CoursesService(makeMockAgentClient() as never, queueProvider as never, makeMockProvisioningService() as never);
    const result = await service.createOrReuse('user-1', { topic: 'Rust', difficulty: 'intermediate', moduleCount: 8 });
    expect(result.reused).toBe(false);
    expect(result.courseId).toBe('new-course-id');
    expect(queueProvider.enqueue).toHaveBeenCalledOnce();
  });
});
