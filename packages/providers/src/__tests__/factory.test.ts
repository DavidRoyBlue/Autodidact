import { describe, it, expect, vi, afterEach } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────
// Mock concrete implementations (static imports in factory.ts)
// Paths are relative to this test file (src/__tests__/), same resolution as
// the relative imports in src/factory.ts.
// ────────────────────────────────────────────────────────────────────────────

const { MockOpenAILLMProvider, MockAnthropicLLMProvider } = vi.hoisted(() => ({
  MockOpenAILLMProvider: vi.fn().mockImplementation(() => ({
    getModel: vi.fn().mockReturnValue({}),
    getModelName: vi.fn().mockReturnValue('gpt-4o'),
  })),
  MockAnthropicLLMProvider: vi.fn().mockImplementation(() => ({
    getModel: vi.fn().mockReturnValue({}),
    getModelName: vi.fn().mockReturnValue('claude-3-5-sonnet'),
  })),
}));

vi.mock('../implementations/llm/openai.provider', () => ({ OpenAILLMProvider: MockOpenAILLMProvider }));
vi.mock('../implementations/llm/anthropic.provider', () => ({ AnthropicLLMProvider: MockAnthropicLLMProvider }));
vi.mock('../implementations/embedding/openai-embedding.provider', () => ({
  OpenAIEmbeddingProvider: vi.fn().mockImplementation(() => ({
    embed: vi.fn(),
    embedBatch: vi.fn(),
  })),
}));
const { MockCloudTasksQueueProvider, MockLoopbackQueueProvider } = vi.hoisted(() => ({
  MockCloudTasksQueueProvider: vi.fn().mockImplementation(() => ({
    enqueue: vi.fn(),
    close: vi.fn(),
  })),
  MockLoopbackQueueProvider: vi.fn().mockImplementation(() => ({
    enqueue: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock('../implementations/queue/cloud-tasks.provider', () => ({
  CloudTasksQueueProvider: MockCloudTasksQueueProvider,
}));
vi.mock('../implementations/queue/loopback.provider', () => ({
  LoopbackQueueProvider: MockLoopbackQueueProvider,
}));
vi.mock('../implementations/auth/supabase-auth.provider', () => ({
  SupabaseAuthProvider: vi.fn().mockImplementation(() => ({
    verifyToken: vi.fn(),
  })),
}));
vi.mock('../implementations/checkpointer/memory.provider', () => ({
  MemoryCheckpointerProvider: vi.fn().mockImplementation(() => ({
    getCheckpointer: vi.fn().mockReturnValue({}),
  })),
}));
vi.mock('../implementations/checkpointer/postgres.provider', () => ({
  PostgresCheckpointerProvider: vi.fn().mockImplementation(() => ({
    getCheckpointer: vi.fn().mockImplementation(() => {
      throw new Error('Must call init() first');
    }),
    init: vi.fn(),
  })),
}));

import {
  createLLMProvider,
  createEmbeddingProvider,
  createQueueProvider,
  createAuthProvider,
  createCheckpointer,
} from '../factory.js';

// ────────────────────────────────────────────────────────────────────────────

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('createLLMProvider()', () => {
  it('returns a provider with getModel() and getModelName() when LLM_PROVIDER=openai', () => {
    vi.stubEnv('LLM_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const provider = createLLMProvider();
    expect(typeof provider.getModel).toBe('function');
    expect(typeof provider.getModelName).toBe('function');
  });

  it('getModelName() contains "gpt" for the default openai provider', () => {
    vi.stubEnv('LLM_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const provider = createLLMProvider();
    expect(provider.getModelName().toLowerCase()).toContain('gpt');
  });

  it('instantiates OpenAILLMProvider when LLM_PROVIDER=openai', () => {
    vi.stubEnv('LLM_PROVIDER', 'openai');
    createLLMProvider({ openaiApiKey: 'key' });
    expect(MockOpenAILLMProvider).toHaveBeenCalled();
    expect(MockAnthropicLLMProvider).not.toHaveBeenCalled();
  });

  it('instantiates AnthropicLLMProvider when LLM_PROVIDER=anthropic', () => {
    createLLMProvider({ llmProvider: 'anthropic', anthropicApiKey: 'key' });
    expect(MockAnthropicLLMProvider).toHaveBeenCalled();
  });

  it('returns anthropic provider when LLM_PROVIDER=anthropic', () => {
    vi.stubEnv('LLM_PROVIDER', 'anthropic');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const provider = createLLMProvider();
    expect(typeof provider.getModelName).toBe('function');
    const name = provider.getModelName().toLowerCase();
    expect(name).toMatch(/claude|anthropic/);
  });

  it('config object overrides env var', () => {
    vi.stubEnv('LLM_PROVIDER', 'openai');
    const provider = createLLMProvider({ llmProvider: 'openai', openaiApiKey: 'config-key' });
    expect(typeof provider.getModelName).toBe('function');
  });

  it('defaults to openai when LLM_PROVIDER is not set', () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const provider = createLLMProvider();
    expect(provider.getModelName().toLowerCase()).toContain('gpt');
  });
});

describe('createEmbeddingProvider()', () => {
  it('returns a provider with embed() and embedBatch()', () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const provider = createEmbeddingProvider();
    expect(typeof provider.embed).toBe('function');
    expect(typeof provider.embedBatch).toBe('function');
  });
});

describe('createQueueProvider()', () => {
  it('defaults to the loopback provider when QUEUE_PROVIDER is not set', () => {
    const provider = createQueueProvider();
    expect(MockLoopbackQueueProvider).toHaveBeenCalledWith({
      workerBaseUrl: 'http://localhost:3002',
    });
    expect(MockCloudTasksQueueProvider).not.toHaveBeenCalled();
    expect(typeof provider.enqueue).toBe('function');
    expect(typeof provider.close).toBe('function');
  });

  it('instantiates CloudTasksQueueProvider when QUEUE_PROVIDER=cloudtasks', () => {
    vi.stubEnv('QUEUE_PROVIDER', 'cloudtasks');
    vi.stubEnv('GCP_PROJECT_ID', 'proj');
    vi.stubEnv('CLOUD_TASKS_LOCATION', 'us-central1');
    vi.stubEnv('WORKER_TASK_BASE_URL', 'https://worker.run.app');
    vi.stubEnv('CLOUD_TASKS_INVOKER_SA', 'sa@proj.iam.gserviceaccount.com');
    createQueueProvider();
    expect(MockCloudTasksQueueProvider).toHaveBeenCalledWith({
      projectId: 'proj',
      location: 'us-central1',
      workerBaseUrl: 'https://worker.run.app',
      invokerServiceAccount: 'sa@proj.iam.gserviceaccount.com',
    });
  });

  it('config object overrides env vars', () => {
    vi.stubEnv('QUEUE_PROVIDER', 'cloudtasks');
    createQueueProvider({ queueProvider: 'loopback', workerBaseUrl: 'http://worker:9999' });
    expect(MockLoopbackQueueProvider).toHaveBeenCalledWith({
      workerBaseUrl: 'http://worker:9999',
    });
    expect(MockCloudTasksQueueProvider).not.toHaveBeenCalled();
  });
});

describe('createCheckpointer()', () => {
  it('returns memory checkpointer by default', () => {
    const checkpointer = createCheckpointer({ checkpointer: 'memory' });
    expect(typeof checkpointer.getCheckpointer).toBe('function');
    const saver = checkpointer.getCheckpointer();
    expect(saver).toBeDefined();
  });

  it('returns postgres checkpointer when configured', () => {
    const checkpointer = createCheckpointer({
      checkpointer: 'postgres',
      databaseUrl: 'postgresql://localhost/test',
    });
    expect(typeof checkpointer.getCheckpointer).toBe('function');
    expect(() => checkpointer.getCheckpointer()).toThrow();
  });
});

describe('createAuthProvider()', () => {
  it('returns a provider with verifyToken()', () => {
    const provider = createAuthProvider({ supabaseUrl: 'https://test.supabase.co' });
    expect(typeof provider.verifyToken).toBe('function');
  });
});
