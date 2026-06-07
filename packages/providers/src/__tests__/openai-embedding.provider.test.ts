import { describe, it, expect, vi, beforeEach } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────
// Mock @langchain/openai before importing the provider under test.
// The MockOpenAIEmbeddings captures the constructor config and provides
// scripted return values for embedQuery / embedDocuments.
// ────────────────────────────────────────────────────────────────────────────

const { MockOpenAIEmbeddings, mockEmbedQuery, mockEmbedDocuments } = vi.hoisted(() => {
  const mockEmbedQuery = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
  const mockEmbedDocuments = vi.fn().mockResolvedValue([[0.1, 0.2], [0.3, 0.4]]);

  const MockOpenAIEmbeddings = vi.fn().mockImplementation((config: Record<string, unknown>) => ({
    _config: config,
    embedQuery: mockEmbedQuery,
    embedDocuments: mockEmbedDocuments,
  }));

  return { MockOpenAIEmbeddings, mockEmbedQuery, mockEmbedDocuments };
});

vi.mock('@langchain/openai', () => ({
  OpenAIEmbeddings: MockOpenAIEmbeddings,
  // Keep ChatOpenAI available in case other modules pull it from the same mock
  ChatOpenAI: vi.fn(),
}));

// ────────────────────────────────────────────────────────────────────────────

import { OpenAIEmbeddingProvider } from '../implementations/embedding/openai-embedding.provider.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockEmbedQuery.mockResolvedValue([0.1, 0.2, 0.3]);
  mockEmbedDocuments.mockResolvedValue([[0.1, 0.2], [0.3, 0.4]]);
});

describe('OpenAIEmbeddingProvider construction', () => {
  it('passes apiKey to OpenAIEmbeddings constructor', () => {
    new OpenAIEmbeddingProvider({ apiKey: 'sk-embed-key' });
    expect(MockOpenAIEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sk-embed-key' }),
    );
  });

  it('uses default model "text-embedding-3-small" when model is not provided', () => {
    new OpenAIEmbeddingProvider({ apiKey: 'sk-embed-key' });
    expect(MockOpenAIEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'text-embedding-3-small' }),
    );
  });

  it('passes custom model to OpenAIEmbeddings constructor', () => {
    new OpenAIEmbeddingProvider({ apiKey: 'sk-embed-key', model: 'text-embedding-ada-002' });
    expect(MockOpenAIEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'text-embedding-ada-002' }),
    );
  });
});

describe('OpenAIEmbeddingProvider.embed()', () => {
  it('delegates to embeddings.embedQuery and returns the vector', async () => {
    const provider = new OpenAIEmbeddingProvider({ apiKey: 'sk-embed-key' });
    const result = await provider.embed('hello world');
    expect(mockEmbedQuery).toHaveBeenCalledWith('hello world');
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it('passes the exact text through to the SDK', async () => {
    const provider = new OpenAIEmbeddingProvider({ apiKey: 'sk-embed-key' });
    await provider.embed('a specific query string');
    expect(mockEmbedQuery).toHaveBeenCalledWith('a specific query string');
  });

  it('returns the vector returned by the SDK', async () => {
    mockEmbedQuery.mockResolvedValueOnce([0.9, 0.8, 0.7, 0.6]);
    const provider = new OpenAIEmbeddingProvider({ apiKey: 'sk-embed-key' });
    const result = await provider.embed('text');
    expect(result).toEqual([0.9, 0.8, 0.7, 0.6]);
  });
});

describe('OpenAIEmbeddingProvider.embedBatch()', () => {
  it('delegates to embeddings.embedDocuments and returns all vectors', async () => {
    const provider = new OpenAIEmbeddingProvider({ apiKey: 'sk-embed-key' });
    const result = await provider.embedBatch(['doc1', 'doc2']);
    expect(mockEmbedDocuments).toHaveBeenCalledWith(['doc1', 'doc2']);
    expect(result).toEqual([[0.1, 0.2], [0.3, 0.4]]);
  });

  it('passes the exact texts array through to the SDK', async () => {
    const provider = new OpenAIEmbeddingProvider({ apiKey: 'sk-embed-key' });
    const texts = ['apple', 'banana', 'cherry'];
    await provider.embedBatch(texts);
    expect(mockEmbedDocuments).toHaveBeenCalledWith(texts);
  });

  it('returns the matrix of vectors returned by the SDK', async () => {
    const vectors = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
    mockEmbedDocuments.mockResolvedValueOnce(vectors);
    const provider = new OpenAIEmbeddingProvider({ apiKey: 'sk-embed-key' });
    const result = await provider.embedBatch(['a', 'b', 'c']);
    expect(result).toEqual(vectors);
  });
});

describe('OpenAIEmbeddingProvider.getEmbeddings()', () => {
  it('returns the OpenAIEmbeddings instance created during construction', () => {
    const provider = new OpenAIEmbeddingProvider({ apiKey: 'sk-embed-key' });
    const embeddings = provider.getEmbeddings();
    expect(embeddings).toBeDefined();
    // The returned instance must have the embedQuery method (SDK interface)
    expect(typeof (embeddings as unknown as { embedQuery: unknown }).embedQuery).toBe('function');
  });

  it('returns the same instance on multiple calls', () => {
    const provider = new OpenAIEmbeddingProvider({ apiKey: 'sk-embed-key' });
    expect(provider.getEmbeddings()).toBe(provider.getEmbeddings());
  });
});
