import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { modules } from './modules.js';
import { vector } from '../vector.js';

/**
 * RAG corpus for grounded tutoring: each module's source content split into
 * embeddable chunks. Populated at course-generation time (worker) and queried
 * by the agent's retrieval step at tutoring time via cosine similarity.
 *
 * Chunks are course-scoped (not user-scoped) — see ADR-024 for why this lives
 * in a pgvector table rather than a LangGraph Store.
 */
export const moduleContentChunks = pgTable(
  'module_content_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    moduleId: uuid('module_id')
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    // 1536 = OpenAI text-embedding-3-small (matches courses.topic_embedding).
    embedding: vector('embedding', { dimensions: 1536 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    moduleIdx: index('module_content_chunks_module_id_idx').on(table.moduleId),
  }),
);
