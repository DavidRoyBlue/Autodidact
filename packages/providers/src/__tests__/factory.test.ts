import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────
// Mock concrete implementations (static imports in factory.ts)
// Paths are relative to this test file (src/__tests__/), same resolution as
// the relative imports in src/factory.ts.
// ────────────────────────────────────────────────────────────────────────────

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

import {
  createEmbeddingProvider,
  createQueueProvider,
  createAuthProvider,
} from '../factory.js';

// ────────────────────────────────────────────────────────────────────────────

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
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
  // Hermetic: the developer shell / .env.dev may carry real values for these.
  beforeEach(() => {
    vi.stubEnv('QUEUE_PROVIDER', undefined);
    vi.stubEnv('GCP_PROJECT_ID', undefined);
    vi.stubEnv('WORKER_TASK_BASE_URL', undefined);
    vi.stubEnv('CLOUD_TASKS_INVOKER_SA', undefined);
  });

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

  it('throws on an unknown QUEUE_PROVIDER value instead of falling back to loopback', () => {
    vi.stubEnv('QUEUE_PROVIDER', 'bullmq');
    expect(() => createQueueProvider()).toThrow(/Unknown QUEUE_PROVIDER 'bullmq'/);
    expect(MockLoopbackQueueProvider).not.toHaveBeenCalled();
  });

  it('throws when QUEUE_PROVIDER=cloudtasks is missing required config', () => {
    vi.stubEnv('QUEUE_PROVIDER', 'cloudtasks');
    expect(() => createQueueProvider()).toThrow(
      /GCP_PROJECT_ID, WORKER_TASK_BASE_URL, CLOUD_TASKS_INVOKER_SA/,
    );
    expect(MockCloudTasksQueueProvider).not.toHaveBeenCalled();
  });
});

describe('createAuthProvider()', () => {
  it('returns a provider with verifyToken()', () => {
    const provider = createAuthProvider({ supabaseUrl: 'https://test.supabase.co' });
    expect(typeof provider.verifyToken).toBe('function');
  });
});
