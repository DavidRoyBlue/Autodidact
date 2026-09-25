import { vi } from 'vitest';

export const sampleUser = {
  id: 'user-uuid-1',
  supabaseId: 'user-uuid-1',
  email: 'test@example.com',
};

/** What the course-creator workflow returns, as the worker persists it. */
export const sampleGeneratedCourse = {
  title: 'Introduction to Python',
  description: 'Learn Python programming from the ground up.',
  difficulty: 'beginner' as const,
  budget: { estimated_minutes: 60 },
  modules: [
    {
      position: 1,
      title: 'Getting Started',
      description: 'Set up your Python environment and write your first program.',
      objectives: ['Understand Python syntax', 'Run a Python script', 'Use the REPL'],
      content: '## Installation\nInstall Python 3 and verify it.\n\n## Hello World\nPrint, then run a script.',
      estimated_minutes: 60,
      resources: [],
    },
  ],
};

export function makeMockLLMProvider(responseContent = 'mock response') {
  const mockModel = {
    invoke: vi.fn().mockResolvedValue({ content: responseContent }),
    stream: vi.fn(),
    modelName: 'gpt-4o',
  };
  return {
    getModel: vi.fn().mockReturnValue(mockModel),
    getModelName: vi.fn().mockReturnValue('gpt-4o'),
    _mockModel: mockModel,
  };
}

export function makeMockQueueProvider() {
  return {
    enqueue: vi.fn().mockResolvedValue('test-job-id'),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

export function makeMockAuthProvider(user = sampleUser) {
  return {
    verifyToken: vi.fn().mockResolvedValue(user),
  };
}

export function makeMockEmbeddingProvider(vector: number[] = Array(1536).fill(0.1) as number[]) {
  return {
    embed: vi.fn().mockResolvedValue(vector),
    embedBatch: vi.fn().mockResolvedValue([vector]),
    getEmbeddings: vi.fn().mockReturnValue({}),
  };
}

export function makeMockAgentClient() {
  return {
    generateEmbedding: vi.fn().mockResolvedValue(Array(1536).fill(0.1) as number[]),
  };
}

export function makeMockPlatformClient() {
  return { generateCourse: vi.fn().mockResolvedValue(sampleGeneratedCourse) };
}

export function makeMockProvisioningService() {
  return { ensureProvisioned: vi.fn().mockResolvedValue(undefined) };
}

export function makeMockLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}
