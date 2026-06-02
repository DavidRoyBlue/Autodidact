import type { IEmbeddingProvider } from '@autodidact/providers';

export interface RetrievedChunk {
  chunkIndex: number;
  content: string;
  /** Cosine similarity in [0, 1]; higher is closer. */
  similarity: number;
}

/**
 * Retrieves the top-k most relevant source-content chunks for a module given a
 * query. Implemented as an interface so the teacher node and tests depend on the
 * capability, not on a database connection. (Phase 2 will expose this as a
 * model-invoked LangGraph tool; Phase 1 calls it deterministically.)
 */
export interface ContentRetriever {
  retrieve(moduleId: string, query: string, k: number): Promise<RetrievedChunk[]>;
}

/** Render retrieved chunks into the grounding block passed to the teacher prompt. */
export function formatRetrievedContext(chunks: RetrievedChunk[]): string {
  return chunks.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n');
}

/**
 * pgvector-backed retriever. Embeds the query with the shared embedding provider
 * (text-embedding-3-small, 1536d) and runs a cosine-distance nearest-neighbour
 * search against `module_content_chunks`, scoped to one module. Uses a
 * parameterized query (no string interpolation of user input).
 */
export class PgVectorContentRetriever implements ContentRetriever {
  constructor(
    private readonly embeddings: IEmbeddingProvider,
    private readonly getPool: () => { query: (text: string, params: unknown[]) => Promise<{ rows: Array<{ chunk_index: number; content: string; similarity: number }> }> },
    private readonly minSimilarity = 0.2,
  ) {}

  async retrieve(moduleId: string, query: string, k: number): Promise<RetrievedChunk[]> {
    const vector = await this.embeddings.embed(query);
    const literal = `[${vector.join(',')}]`;
    const { rows } = await this.getPool().query(
      `SELECT chunk_index, content, 1 - (embedding <=> $1::vector) AS similarity
         FROM module_content_chunks
        WHERE module_id = $2 AND embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $3`,
      [literal, moduleId, k],
    );
    return rows
      .map((r) => ({
        chunkIndex: r.chunk_index,
        content: r.content,
        similarity: Number(r.similarity),
      }))
      .filter((r) => r.similarity >= this.minSimilarity);
  }
}
