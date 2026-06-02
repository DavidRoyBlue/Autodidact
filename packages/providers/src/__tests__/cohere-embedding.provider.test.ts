import { describe, it, expect } from 'vitest';
import { CohereEmbeddingProvider } from '../implementations/embedding/cohere-embedding.provider.js';

// ────────────────────────────────────────────────────────────────────────────
// CohereEmbeddingProvider is an intentional stub.
// These tests lock the stub contract: every public method must throw the
// designated message so a future implementer can't silently break callers by
// shipping a half-baked implementation.
// No SDK mock is needed — the stub doesn't import any vendor SDK.
// ────────────────────────────────────────────────────────────────────────────

const STUB_ERROR = 'CohereEmbeddingProvider is not yet implemented';

describe('CohereEmbeddingProvider (stub contract)', () => {
  it('constructs without throwing', () => {
    expect(() => new CohereEmbeddingProvider('cohere-api-key')).not.toThrow();
  });

  describe('embed()', () => {
    it('throws the stub error message', async () => {
      const provider = new CohereEmbeddingProvider('cohere-api-key');
      await expect(provider.embed('some text')).rejects.toThrow(STUB_ERROR);
    });

    it('always throws regardless of input', async () => {
      const provider = new CohereEmbeddingProvider('cohere-api-key');
      await expect(provider.embed('')).rejects.toThrow(STUB_ERROR);
      await expect(provider.embed('any text')).rejects.toThrow(STUB_ERROR);
    });
  });

  describe('embedBatch()', () => {
    it('throws the stub error message', async () => {
      const provider = new CohereEmbeddingProvider('cohere-api-key');
      await expect(provider.embedBatch(['a', 'b'])).rejects.toThrow(STUB_ERROR);
    });

    it('always throws regardless of input', async () => {
      const provider = new CohereEmbeddingProvider('cohere-api-key');
      await expect(provider.embedBatch([])).rejects.toThrow(STUB_ERROR);
      await expect(provider.embedBatch(['x'])).rejects.toThrow(STUB_ERROR);
    });
  });

  describe('getEmbeddings()', () => {
    it('throws the stub error message', () => {
      const provider = new CohereEmbeddingProvider('cohere-api-key');
      expect(() => provider.getEmbeddings()).toThrow(STUB_ERROR);
    });
  });
});
