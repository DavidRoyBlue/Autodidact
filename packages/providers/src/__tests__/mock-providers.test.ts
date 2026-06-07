import { describe, it, expect } from 'vitest';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { CourseBlueprintSchema } from '@autodidact/schemas';
import { MockLLMProvider } from '../implementations/llm/mock.provider.js';
import { MockEmbeddingProvider } from '../implementations/embedding/mock-embedding.provider.js';
import { MockAuthProvider } from '../implementations/auth/mock-auth.provider.js';
import {
  createLLMProvider,
  createEmbeddingProvider,
  createAuthProvider,
} from '../factory.js';

describe('MockLLMProvider', () => {
  const model = new MockLLMProvider().getModel();

  it('returns a CourseBlueprintSchema-valid JSON for the curriculum-designer prompt', async () => {
    const res = await model.invoke([
      new SystemMessage('You are an expert curriculum designer. Produce a blueprint.'),
      new HumanMessage('Topic: TypeScript, difficulty: beginner, modules: 3'),
    ]);
    const content = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
    const parsed = CourseBlueprintSchema.safeParse(JSON.parse(content));
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.modules.length).toBeGreaterThanOrEqual(3);
  });

  it('signals completion via the [MODULE_COMPLETE:score=N] marker for a teaching turn', async () => {
    const res = await model.invoke([
      new SystemMessage('You are a patient tutor for this module.'),
      new HumanMessage('I think I understand recursion now.'),
    ]);
    const content = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
    expect(content).toMatch(/\[MODULE_COMPLETE:score=\d+\]/);
  });

  it('returns evaluator JSON for the assessment-AI prompt', async () => {
    const res = await model.invoke([
      new SystemMessage('You are an educational assessment AI. Evaluate whether the student understood.'),
      new HumanMessage('Objectives: [...]'),
    ]);
    const content = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
    const parsed = JSON.parse(content) as { completed: boolean; score: number };
    expect(typeof parsed.completed).toBe('boolean');
    expect(typeof parsed.score).toBe('number');
  });

  it('reports a stable model name', () => {
    expect(new MockLLMProvider().getModelName()).toBe('mock');
  });
});

describe('MockEmbeddingProvider', () => {
  const provider = new MockEmbeddingProvider();

  it('embeds a single text to a 1536-dim vector', async () => {
    const vec = await provider.embed('hello');
    expect(vec).toHaveLength(1536);
    expect(vec.every((n) => typeof n === 'number')).toBe(true);
  });

  it('is deterministic and distinguishes distinct texts', async () => {
    const a1 = await provider.embed('alpha');
    const a2 = await provider.embed('alpha');
    const b = await provider.embed('beta');
    expect(a1).toEqual(a2);
    expect(a1).not.toEqual(b);
  });

  it('embedBatch returns one 1536-dim vector per input', async () => {
    const vecs = await provider.embedBatch(['x', 'y']);
    expect(vecs).toHaveLength(2);
    expect(vecs[0]).toHaveLength(1536);
  });

  it('exposes a LangChain Embeddings via getEmbeddings()', async () => {
    const emb = provider.getEmbeddings();
    const q = await emb.embedQuery('q');
    expect(q).toHaveLength(1536);
  });
});

describe('MockAuthProvider', () => {
  const provider = new MockAuthProvider();

  it('resolves a Bearer test-<id> token to an AuthUser with that id', async () => {
    const user = await provider.verifyToken('test-abc-123');
    expect(user.id).toBe('abc-123');
    expect(user.supabaseId).toBe('sb-abc-123');
  });

  it('rejects a token without the test- prefix', async () => {
    await expect(provider.verifyToken('garbage')).rejects.toThrow('Invalid token');
  });
});

describe('factory honors the mock env values', () => {
  it('createLLMProvider({llmProvider:"mock"}) → MockLLMProvider', () => {
    expect(createLLMProvider({ llmProvider: 'mock' })).toBeInstanceOf(MockLLMProvider);
  });

  it('createEmbeddingProvider({embeddingProvider:"mock"}) → MockEmbeddingProvider', () => {
    expect(createEmbeddingProvider({ embeddingProvider: 'mock' })).toBeInstanceOf(MockEmbeddingProvider);
  });

  it('createAuthProvider({authProvider:"mock"}) → MockAuthProvider', () => {
    expect(createAuthProvider({ authProvider: 'mock' })).toBeInstanceOf(MockAuthProvider);
  });
});
