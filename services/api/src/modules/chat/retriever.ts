import { getDb, sql } from '@autodidact/db';
import type { ApiAgentClient } from '../../services/agent.client.js';

const TOP_K = 4;
const MIN_SIMILARITY = 0.2;

/**
 * RAG grounding for a learner turn (ADR-024): the top chunks of this module's
 * lesson by cosine similarity to the question, rendered as the `Reference
 * material` block the course-teacher agent expects; empty when nothing is
 * close enough.
 */
export async function referenceMaterial(
  agentClient: ApiAgentClient,
  moduleId: string,
  query: string,
): Promise<string> {
  const literal = `[${(await agentClient.generateEmbedding(query)).join(',')}]`;
  const { rows } = await getDb().execute(sql`
    SELECT content, 1 - (embedding <=> ${literal}::vector) AS similarity
    FROM module_content_chunks
    WHERE module_id = ${moduleId} AND embedding IS NOT NULL
    ORDER BY embedding <=> ${literal}::vector
    LIMIT ${TOP_K}
  `);
  const close = (rows as Array<{ content: string; similarity: number }>).filter(
    (r) => Number(r.similarity) >= MIN_SIMILARITY,
  );
  return close.length === 0
    ? ''
    : `\n\nReference material:\n${close.map((r, i) => `[${i + 1}] ${r.content}`).join('\n\n')}`;
}
