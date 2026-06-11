import { sql, getDb } from '@autodidact/db';
import type { EmbeddingJobData } from '@autodidact/types';
import type { Logger } from '@autodidact/observability';
import type { AgentClient } from '../services/agent.client.js';

export interface EmbeddingDeps {
  agentClient: AgentClient;
  logger: Logger;
}

/**
 * Generates the topic embedding via the Agent service and stores it on the
 * course row. Idempotent — safe to retry any number of times. Invoked per-task
 * by the HTTP layer.
 */
export async function processEmbedding(
  data: EmbeddingJobData,
  { agentClient, logger }: EmbeddingDeps,
): Promise<void> {
  const { courseId, topic } = data;
  const db = getDb();
  logger.info({ courseId }, 'Generating topic embedding');

  const vector = await agentClient.generateEmbedding(topic);
  const vectorLiteral = `[${vector.join(',')}]`;

  // Raw SQL update for pgvector — Drizzle's custom type doesn't handle
  // the ::vector cast cleanly in .set(), so we use execute() directly.
  await db.execute(
    sql`UPDATE courses SET topic_embedding = ${vectorLiteral}::vector, updated_at = NOW() WHERE id = ${courseId}::uuid`,
  );

  logger.info({ courseId }, 'Embedding stored');
}
