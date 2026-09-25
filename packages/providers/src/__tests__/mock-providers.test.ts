import { describe, it, expect } from 'vitest';
import { MockEmbeddingProvider } from '../implementations/embedding/mock-embedding.provider.js';
import { MockAuthProvider } from '../implementations/auth/mock-auth.provider.js';
import { createEmbeddingProvider, createAuthProvider } from '../factory.js';

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
  it('createEmbeddingProvider({embeddingProvider:"mock"}) → MockEmbeddingProvider', () => {
    expect(createEmbeddingProvider({ embeddingProvider: 'mock' })).toBeInstanceOf(MockEmbeddingProvider);
  });

  it('createAuthProvider({authProvider:"mock"}) → MockAuthProvider', () => {
    expect(createAuthProvider({ authProvider: 'mock' })).toBeInstanceOf(MockAuthProvider);
  });
});
