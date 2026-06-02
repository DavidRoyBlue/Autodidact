import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  apiEnvSchema,
  agentEnvSchema,
  workerEnvSchema,
  loadAgentEnv,
} from '../index.js';

describe('apiEnvSchema', () => {
  const valid = {
    DATABASE_URL: 'postgresql://localhost:5432/app',
    REDIS_URL: 'redis://localhost:6379',
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
        expect.arrayContaining([
          'DATABASE_URL',
          'REDIS_URL',
          'SUPABASE_URL',
          'SUPABASE_SECRET_KEY',
        ]),
      );
    }
  });

  it('rejects a non-URL SUPABASE_URL', () => {
    expect(apiEnvSchema.safeParse({ ...valid, SUPABASE_URL: 'not-a-url' }).success).toBe(false);
  });
});

describe('agentEnvSchema', () => {
  const valid = { OPENAI_API_KEY: 'sk-test' };

  it('accepts the default (memory) checkpointer without DATABASE_URL', () => {
    expect(agentEnvSchema.safeParse(valid).success).toBe(true);
  });

  it('requires DATABASE_URL when CHECKPOINTER=postgres', () => {
    const result = agentEnvSchema.safeParse({ ...valid, CHECKPOINTER: 'postgres' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('DATABASE_URL'))).toBe(true);
    }
  });

  it('requires ANTHROPIC_API_KEY when LLM_PROVIDER=anthropic', () => {
    const result = agentEnvSchema.safeParse({ ...valid, LLM_PROVIDER: 'anthropic' });
    expect(result.success).toBe(false);
  });

  it('accepts the anthropic provider when its key is present', () => {
    const result = agentEnvSchema.safeParse({
      ...valid,
      LLM_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'key',
    });
    expect(result.success).toBe(true);
  });
});

describe('workerEnvSchema', () => {
  it('requires DATABASE_URL and REDIS_URL', () => {
    const result = workerEnvSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path.join('.'));
      expect(fields).toEqual(expect.arrayContaining(['DATABASE_URL', 'REDIS_URL']));
    }
  });
});

describe('loadAgentEnv', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('throws a descriptive error naming the service and the missing var', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    expect(() => loadAgentEnv()).toThrowError(/"agent" service/);
    expect(() => loadAgentEnv()).toThrowError(/OPENAI_API_KEY/);
  });

  it('returns a typed object when the environment is valid', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    expect(loadAgentEnv().OPENAI_API_KEY).toBe('sk-test');
  });
});
