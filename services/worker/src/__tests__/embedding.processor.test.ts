import { describe, it, expect, vi, beforeEach } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────
// Mock @autodidact/db
// ────────────────────────────────────────────────────────────────────────────

const mockExecute = vi.fn().mockResolvedValue(undefined);

vi.mock('@autodidact/db', () => ({
  getDb: vi.fn(() => ({ execute: mockExecute })),
  courses: {},
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: 'sql',
    strings,
    values,
    toString: () => strings.join('?'),
  })),
}));

const { processEmbedding } = await import('../processors/embedding.processor.js');

// ────────────────────────────────────────────────────────────────────────────

function makeAgentClient(vector = [0.1, 0.2, 0.3]) {
  return { generateEmbedding: vi.fn().mockResolvedValue(vector), generateCourse: vi.fn() };
}

function makeLogger() {
  return { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
}

function makeDeps(agent = makeAgentClient()) {
  return { agentClient: agent as never, logger: makeLogger() as never };
}

describe('processEmbedding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue(undefined);
  });

  it('calls agentClient.generateEmbedding with the job topic', async () => {
    const agent = makeAgentClient();
    await processEmbedding({ courseId: 'c-1', topic: 'Python' }, makeDeps(agent));
    expect(agent.generateEmbedding).toHaveBeenCalledWith('Python');
  });

  it('executes a SQL UPDATE that includes the ::vector cast', async () => {
    await processEmbedding({ courseId: 'c-1', topic: 'Python' }, makeDeps());
    expect(mockExecute).toHaveBeenCalledOnce();
    // The SQL template strings should contain ::vector
    const sqlArg = mockExecute.mock.calls[0]?.[0] as { strings: TemplateStringsArray };
    const sqlText = sqlArg.strings.join('?');
    expect(sqlText).toContain('::vector');
  });

  it('constructs the correct vector literal from the embedding', async () => {
    const vector = [0.1, 0.2, 0.3];
    await processEmbedding(
      { courseId: 'c-1', topic: 'Python' },
      makeDeps(makeAgentClient(vector)),
    );
    // The vectorLiteral "[0.1,0.2,0.3]" is passed as a template param to sql``
    const sqlArg = mockExecute.mock.calls[0]?.[0] as { values: unknown[] };
    const vectorLiteral = sqlArg.values[0] as string;
    expect(vectorLiteral).toBe('[0.1,0.2,0.3]');
  });

  it('passes courseId as the WHERE clause parameter', async () => {
    await processEmbedding({ courseId: 'course-uuid-99', topic: 'Rust' }, makeDeps());
    const sqlArg = mockExecute.mock.calls[0]?.[0] as { values: unknown[] };
    expect(sqlArg.values).toContain('course-uuid-99');
  });

  it('propagates agent failures (route handler owns retry semantics)', async () => {
    const agent = makeAgentClient();
    agent.generateEmbedding.mockRejectedValue(new Error('embed failed'));
    await expect(
      processEmbedding({ courseId: 'c-1', topic: 'Python' }, makeDeps(agent)),
    ).rejects.toThrow('embed failed');
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
