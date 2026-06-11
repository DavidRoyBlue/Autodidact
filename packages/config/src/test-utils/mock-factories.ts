import { vi } from 'vitest';

export const sampleUser = {
  id: 'user-uuid-1',
  supabaseId: 'user-uuid-1',
  email: 'test@example.com',
};

export const sampleBlueprint = {
  title: 'Introduction to Python',
  description: 'Learn Python programming from the ground up.',
  difficulty: 'beginner' as const,
  estimatedHours: 10,
  modules: [
    {
      position: 0,
      title: 'Getting Started',
      description: 'Set up your Python environment and write your first program.',
      objectives: ['Understand Python syntax', 'Run a Python script', 'Use the REPL'],
      contentOutline: [
        { title: 'Installation', points: ['Install Python 3', 'Verify installation'] },
        { title: 'Hello World', points: ['Print statement', 'Running scripts'] },
      ],
      estimatedMinutes: 60,
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
    generateCourse: vi.fn().mockResolvedValue(sampleBlueprint),
  };
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
