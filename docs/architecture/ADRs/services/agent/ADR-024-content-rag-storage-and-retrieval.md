# ADR-024: Content RAG storage & retrieval for grounded tutoring

## Status

Accepted — 2026-06-02

## Context

The module-chat teacher answers from the module outline embedded in its system prompt
(`buildModuleSystemPrompt`). That outline is a terse list of section titles and bullet points — it
is not the full source content, so the tutor can drift, hallucinate detail, or answer beyond what the
course actually covers. Today the only embedding in the system is `courses.topic_embedding`, used for
course-reuse deduplication; module *content* is never embedded or retrievable.

We want retrieval-augmented tutoring: for each learner question, fetch the most relevant passages of
the module's own content and ground the teacher's answer in them. This also lays the substrate for the
later agentic-tools phase, where retrieval becomes one model-invoked tool among several.

Decisions required: where to store the embeddable content, how the agent retrieves it, and how
retrieval composes with the existing graph without breaking its invariants.

## Decision

**Storage — a dedicated pgvector table, not a LangGraph Store.**
A new table `module_content_chunks(id, module_id → modules, chunk_index, content, embedding vector(1536),
created_at)` with an HNSW cosine index (mirroring `courses_topic_embedding_idx`). Content is
**course-scoped, not user-scoped**, so it does not belong in a per-user LangGraph Store (that is for
Phase 3 learner memory). A pgvector table reuses the existing Drizzle migration path, the `vector()`
column type, the 1536-d `text-embedding-3-small` provider, and the established raw-SQL `<=>` query
pattern (ADR-010). Chunking is deterministic (`chunkModuleContent`): an intro chunk, an objectives
chunk, and one chunk per content-outline section.

**Indexing — at course-generation time, in the worker, best-effort.**
After the course-ready transaction commits, the worker chunks each module, embeds each chunk via the
Agent (`AgentClient.generateEmbedding` — no LLM SDK in the worker), and inserts rows with a raw-SQL
`::vector` cast. It runs *outside* the transaction and swallows errors: RAG is additive, so an indexing
hiccup must never fail course generation or trigger a full job retry.

**Retrieval — a deterministic step in the teacher node, shaped as a reusable capability.**
The agent gains a `ContentRetriever` interface with a `PgVectorContentRetriever` implementation
(embeds the query, cosine-searches the chunk table scoped to the module, filters by a minimum
similarity). The teacher node, when given a retriever and a module id, retrieves top-k chunks for the
latest learner message and passes them to `buildModuleSystemPrompt` as a grounding block. Retrieval is
**best-effort** (failures fall back to the un-grounded prompt) and **opt-in** via `RAG_ENABLED` — when
off, behavior is byte-identical to before. The retriever is an interface (not a hardcoded query) so
Phase 2 can expose it as a model-invoked `ToolNode` tool with no rewrite.

**Boundary — the agent gains read access to app data.**
Retrieval requires the agent to query `module_content_chunks`, so the agent now depends on
`@autodidact/db` (it already held `DATABASE_URL` for the Postgres checkpointer). This is a deliberate,
scoped expansion: RAG retrieval is an AI-runtime concern. The agent reads only the chunk table.

The API now includes the module `id` in the `moduleBlueprint` payload so the agent can scope retrieval.

## Consequences

### Positive

- The tutor can ground answers in real module content; quality is measurable via the eval harness
  (tutoring-relevance / future factuality scorers).
- Reuses existing pgvector, embedding provider, and migration infrastructure — no new vendor surface.
- Retrieval-as-interface composes directly into the Phase 2 tool loop.
- Fully gated: `RAG_ENABLED=false` (default) preserves current behavior, enabling safe staged rollout.

### Negative

- The agent now reads application data (chunks), a boundary it did not cross before. Confined to the
  chunk table and documented here.
- Indexing adds N embedding round-trips per course at generation time (one per chunk). Acceptable on
  the async job path; batch embedding is a future optimization.
- `module_content_chunks` has no RLS policy yet. It is read server-side only (agent/worker via the
  service connection; never the mobile client). Add RLS if direct client access is ever introduced.

### Neutral

- Chunking is intentionally simple (section-granularity). If retrieval quality needs finer chunks,
  `chunkModuleContent` is the single place to change it.

## Alternatives considered

- **LangGraph `Store` with a pgvector index.** Rejected for content: Stores are namespaced for
  per-entity (per-user) memory; module content is shared/course-scoped. Reserved for Phase 3 memory.
- **Retrieve in `services/api` and pass chunks in the request.** Rejected: puts AI-runtime retrieval
  logic in the public API and does not compose into the agent's future tool loop.
- **Embed full module content as one vector.** Rejected: chunk-level retrieval gives far better
  passage relevance than a single coarse document embedding.

## References

- ADR-006: AI orchestration framework (LangGraph graph this extends)
- ADR-010: Vector search strategy (pgvector / HNSW / cosine pattern reused)
- ADR-023: LangChain upgrade deferral (notes the agent↔db CJS/ESM consideration)
- `packages/db/migrations/0005_module_content_chunks.sql`, `services/agent/src/rag/`, `services/worker/src/rag/`
