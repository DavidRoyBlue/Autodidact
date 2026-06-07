import { Embeddings } from '@langchain/core/embeddings';
import type { IEmbeddingProvider } from '../../interfaces/embedding.js';

const DIMENSIONS = 1536;

/**
 * Deterministic 1536-dim embedding (matches OpenAI text-embedding-3-small dims).
 * Network-free: a constant base with a few text-derived dimensions so distinct
 * topics map to distinct-but-stable vectors.
 */
function mockVector(text: string): number[] {
  const vec = new Array<number>(DIMENSIONS).fill(0.1);
  for (let i = 0; i < text.length; i++) {
    vec[i % DIMENSIONS] = ((text.charCodeAt(i) % 100) / 100) * 0.5 + 0.1;
  }
  return vec;
}

class MockEmbeddings extends Embeddings {
  constructor() {
    super({});
  }

  async embedQuery(text: string): Promise<number[]> {
    return mockVector(text);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map(mockVector);
  }
}

export class MockEmbeddingProvider implements IEmbeddingProvider {
  private readonly embeddings = new MockEmbeddings();

  async embed(text: string): Promise<number[]> {
    return mockVector(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(mockVector);
  }

  getEmbeddings(): Embeddings {
    return this.embeddings;
  }
}
