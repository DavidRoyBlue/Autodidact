-- RAG corpus for grounded tutoring (ADR-024).
-- Per-module source content split into embeddable chunks. Written by the worker
-- at course-generation time; queried by the agent's retrieval step via cosine
-- similarity at tutoring time.
CREATE TABLE module_content_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id    UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  chunk_index  INTEGER NOT NULL,
  content      TEXT NOT NULL,
  embedding    vector(1536),
  created_at   TIMESTAMP NOT NULL DEFAULT now()
);

-- Lookup / delete by module
CREATE INDEX module_content_chunks_module_id_idx
  ON module_content_chunks(module_id);

-- HNSW index for fast approximate nearest-neighbour cosine search
-- (mirrors courses_topic_embedding_idx; m/ef_construction tuned the same way).
CREATE INDEX module_content_chunks_embedding_idx
  ON module_content_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
