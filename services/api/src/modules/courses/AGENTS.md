# Subtree Instructions — services/api/src/modules/courses/

> These rules apply only within `services/api/src/modules/courses/`. They extend `services/api/AGENTS.md`.

## Purpose of this subtree

The courses module owns the course lifecycle from creation to enrollment:
- Semantic similarity check before creating a new course (deduplication)
- Course row creation and Cloud Tasks enqueueing for async generation (loopback provider in dev)
- Enrollment upsert and per-user `module_progress` row initialisation
- Course and module retrieval, with each learner's progress and next module on `GET /courses`; retry of failed generations (status is DB-backed: `courses.status`)

---

## Invariants (must not be broken)

- **Always run the similarity check first**: `createOrReuse()` MUST call `agentClient.generateEmbedding()` and run the pgvector cosine similarity query before inserting a new course row. Never skip this step to force new course creation — it creates duplicates and wastes LLM calls.
- **Similarity threshold is 0.92**: a cosine similarity `>= 0.92` (i.e., `1 - (topic_embedding <=> vector) > 0.92`), matched on the same `difficulty` and `time_budget`, reuses the existing ready, public course (ADR-030). Do not lower this threshold without measuring duplicate rate on production data.
- **Raw SQL for the similarity query**: the similarity search uses `db.execute(sql\`...\`)` with a raw SQL template rather than Drizzle's query builder. This is intentional — Drizzle's query builder does not handle the `::vector` cast for the pgvector `<=>` operator cleanly. Do not convert this to a Drizzle fluent query.
- **Course status lifecycle**: `'pending'` (inserted, task enqueued) → `'generating'` → `'ready'` (Worker wrote the course and its modules) or `'failed'` (Worker, on retry exhaustion). The API service only writes `'pending'`; only the Worker writes `'ready'` or `'failed'`.
- **Generation status is DB-backed**: `courses.status` (`pending`/`generating`/`ready`/`failed`, written by the Worker) is the only source; clients read it from `GET /courses`. There is no per-task status endpoint or lookup. `retryGeneration` re-queues only a `failed` course, and only for its creator.
- **Enrollment and progress rows**: `createOrReuse` enrolls the creator immediately (so the course is listed while it generates). `module_progress` rows (position 0 `'available'`, others `'locked'`, existing rows kept) are made only by `openModuleProgress` from `@autodidact/db`: `enrollUser` calls it for one learner, and the Worker calls it in its course-generation transaction for every enrolled learner when the modules land. Never insert these rows any other way.

---

## Source of truth

- Embedding API contract: `src/services/agent.client.ts` (`generateEmbedding`)
- Queue task shape: `src/queues/definitions.ts` + `@autodidact/types` (`CourseGenerationJobData`); validation schema in `@autodidact/schemas` (`jobs.ts`)
- Schema tables: `courses`, `modules`, `enrollments`, `moduleProgress` in `@autodidact/db`

---

## Anti-patterns to avoid

- Bypassing `createOrReuse()` to insert a course directly (skips similarity check)
- Writing `'ready'` or `'failed'` status from the API service (Worker owns those transitions)
- Using Drizzle fluent query builder for the pgvector `<=>` expression (breaks the cast)
