import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  apiEnvSchema,
  agentEnvSchema,
  workerEnvSchema,
  loadAgentEnv,
  loadWorkerEnv,
} from '../index.js';

describe('apiEnvSchema', () => {
  const valid = {
    DATABASE_URL: 'postgresql://localhost:5432/app',
    SUPABASE_URL: 'https://ref.supabase.co',
    SUPABASE_SECRET_KEY: 'secret',
  };

  it('accepts a minimal valid environment and applies defaults', () => {
    const env = apiEnvSchema.parse(valid);
    expect(env.API_PORT).toBe(3000);
    expect(env.AGENT_SERVICE_URL).toBe('http://localhost:3001');
    expect(env.NODE_ENV).toBe('development');
  });

  it('coerces API_PORT from a string', () => {
    const env = apiEnvSchema.parse({ ...valid, API_PORT: '4000' });
    expect(env.API_PORT).toBe(4000);
  });

  it('reports every missing required var at once', () => {
    const result = apiEnvSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path.join('.'));
      expect(fields).toEqual(
        expect.arrayContaining(['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY']),
      );
    }
  });

  it('rejects a non-URL SUPABASE_URL', () => {
    expect(apiEnvSchema.safeParse({ ...valid, SUPABASE_URL: 'not-a-url' }).success).toBe(false);
  });
});

describe('agentEnvSchema', () => {
  it('accepts an environment with OPENAI_API_KEY and applies AGENT_PORT default', () => {
    const env = agentEnvSchema.parse({ OPENAI_API_KEY: 'sk-test' });
    expect(env.AGENT_PORT).toBe(3001);
  });

  it('accepts an empty environment (OPENAI_API_KEY is optional; e2e runs with EMBEDDING_PROVIDER=mock)', () => {
    expect(agentEnvSchema.safeParse({}).success).toBe(true);
  });
});

describe('workerEnvSchema', () => {
  it('requires DATABASE_URL', () => {
    const result = workerEnvSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path.join('.'));
      expect(fields).toEqual(expect.arrayContaining(['DATABASE_URL']));
    }
  });

  it('applies WORKER_PORT and TASK_MAX_ATTEMPTS defaults', () => {
    const env = workerEnvSchema.parse({ DATABASE_URL: 'postgresql://localhost:5432/app' });
    expect(env.WORKER_PORT).toBe(3002);
    expect(env.TASK_MAX_ATTEMPTS).toBe(3);
  });

  it('coerces TASK_MAX_ATTEMPTS from a string', () => {
    const env = workerEnvSchema.parse({
      DATABASE_URL: 'postgresql://localhost:5432/app',
      TASK_MAX_ATTEMPTS: '5',
    });
    expect(env.TASK_MAX_ATTEMPTS).toBe(5);
  });
});

describe('loadAgentEnv', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns a typed object when the environment is valid', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    expect(loadAgentEnv().OPENAI_API_KEY).toBe('sk-test');
  });
});

describe('loadWorkerEnv', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('throws a descriptive error naming the service and the missing var', () => {
    vi.stubEnv('DATABASE_URL', '');
    expect(() => loadWorkerEnv()).toThrowError(/"worker" service/);
    expect(() => loadWorkerEnv()).toThrowError(/DATABASE_URL/);
  });
});
