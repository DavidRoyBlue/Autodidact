import { getDb, sql } from '@autodidact/db';
import type { Logger } from '@autodidact/observability';
import { chunkModuleContent, type ModuleContent } from './chunk.js';

/** Minimal slice of AgentClient needed for indexing — eases testing. */
export interface EmbeddingClient {
  generateEmbedding(text: string): Promise<number[]>;
}

/**
 * Chunk, embed, and persist each module's content into `module_content_chunks`
 * for RAG retrieval (ADR-024). Embeddings go through the Agent (no LLM SDK in
 * the worker, per worker invariants); inserts use raw SQL with an explicit
 * `::vector` cast, matching the topic-embedding pattern (Drizzle's builder
 * mishandles pgvector parameterization).
 *
 * Best-effort: the caller runs this AFTER the course-ready transaction commits
 * and swallows failures — a RAG indexing hiccup must not fail course generation
 * or trigger a full job retry.
 */
export async function indexModuleChunks(
  modulesWithIds: Array<{ id: string } & ModuleContent>,
  agentClient: EmbeddingClient,
  logger: Logger,
): Promise<void> {
  const db = getDb();
  let inserted = 0;
  for (const mod of modulesWithIds) {
    for (const { chunkIndex, content } of chunkModuleContent(mod)) {
      const vector = await agentClient.generateEmbedding(content);
      const literal = `[${vector.join(',')}]`;
      await db.execute(sql`
        INSERT INTO module_content_chunks (module_id, chunk_index, content, embedding)
        VALUES (${mod.id}::uuid, ${chunkIndex}, ${content}, ${literal}::vector)
      `);
      inserted += 1;
    }
  }
  logger.info(
    { modules: modulesWithIds.length, chunks: inserted },
    'indexed module content chunks',
  );
}
