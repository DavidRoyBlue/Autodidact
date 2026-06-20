# Subtree Instructions — services/worker/

> These rules apply only within `services/worker/`. They extend the root `CLAUDE.md`.

## Purpose of this subtree

Background task handler. A thin Fastify HTTP service whose `/tasks/:name` endpoints are invoked per-task — by GCP Cloud Tasks in production (OIDC-authenticated at the Cloud Run IAM layer) and by the loopback queue provider in local dev:

- `POST /tasks/generate-course` — calls the Agent service to generate a full course blueprint, writes it and all module rows to PostgreSQL, then enqueues a follow-up embedding task.
- `POST /tasks/generate-embedding` — calls the Agent service to generate a topic embedding vector, stores it in `courses.topic_embedding` via raw pgvector SQL.
- `POST /tasks/cleanup-stale-anonymous` — deletes anonymous users older than the retention window (default 90 days): `public.users` first (cascading to enrollments/module_progress/chat_sessions), then `auth.users`, in one transaction. Idempotent; `2xx` ack / `5xx` retry. The recurring schedule (Cloud Scheduler → Cloud Tasks) is **deferred to an infra task** — only the endpoint + processor ship here; in dev it is invoked by a manual POST. See `src/processors/CLAUDE.md`.

Internal only — never exposed publicly. Scales to zero between tasks.

---

## Invariants (must not be broken)

- **The HTTP surface is the task contract only** — `/tasks/:name` routes plus `GET /health`. Do not add business/API routes; user-facing HTTP belongs in `services/api`.
- **No auth code in this service** — Cloud Run IAM authenticates Cloud Tasks' OIDC tokens before requests reach the container. Do not add token verification middleware.
- **Call Agent via `AgentClient`** — do not import LLM SDKs (OpenAI, Anthropic, LangChain) directly. All AI calls go through `src/services/agent.client.ts` to `AGENT_SERVICE_URL`.
- **Course status must be updated at each transition** — set `status = 'generating'` when processing starts; set `status = 'ready'` (inside the transaction) on success; set `status = 'failed'` when the **final attempt** fails (detected via the `X-CloudTasks-TaskRetryCount` header against `TASK_MAX_ATTEMPTS`; a request without the header — loopback — is the single, final attempt).
- **Never flip a `ready` course back** — the failed-marking update is guarded with `status IN ('pending','generating')`.
- **Module rows are inserted inside the same DB transaction as the course `status = 'ready'` update** — if either write fails, both roll back. Never split them.
- **The Worker is the only service that writes `status = 'ready'` or `status = 'failed'`** — the API service only writes `status = 'pending'`.
- **Enqueue the embedding task after a successful course generation** — without the `GENERATE_EMBEDDING` task, `courses.topic_embedding` remains null and the course is never eligible for similarity reuse.
- **Response codes drive queue behaviour** — `2xx` acknowledges a task (no redelivery); `5xx` requests a retry. Returning `200` on a final-attempt failure is intentional: the course is already marked `failed`.
- **Validate every task body with the schemas from `@autodidact/schemas`** (`CourseGenerationJobSchema`, `EmbeddingJobSchema`) before processing.

---

## Library / tooling rules

- Use:
  - `fastify` for the HTTP task surface (matches `services/agent`)
  - `@autodidact/db` (`getDb`, Drizzle ORM) for all database writes
  - `@autodidact/schemas` for task payload validation
  - `@autodidact/types` for task payload types (`CourseGenerationJobData`, `EmbeddingJobData`, `ModuleBlueprint`)
  - `@autodidact/providers` (`IQueueProvider`) for enqueuing follow-up tasks
  - `@autodidact/observability` for logging (never `console.log`)
- Do not use:
  - LLM SDKs directly (`@langchain/openai`, `@anthropic-ai/sdk`, etc.)
  - `bullmq` / `ioredis` — the Redis queue is gone (ADR-027)
  - Raw `pg` or direct `postgres` imports — use `@autodidact/db`

---

## Source of truth

- Task payload types: `@autodidact/types` (`CourseGenerationJobData`, `EmbeddingJobData`); validation schemas: `@autodidact/schemas` (`jobs.ts`)
- Queue and task name constants: `src/queues/definitions.ts` (task name = URL path segment)
- HTTP task contract and retry semantics: `src/app.ts`
- Processor logic: `src/processors/` (pure functions, no transport coupling)
- Agent HTTP contract: `src/services/agent.client.ts` and `services/agent/README.md`
- Database schema: `packages/db/src/schema/`
- Production retry policy: `infra/modules/cloud-tasks/main.tf` (`retry_config`) — `TASK_MAX_ATTEMPTS` must mirror its `max_attempts`

---

## Key patterns to follow

- **Retry config is queue-level** (Terraform), not application code. The handler only distinguishes final vs non-final attempts.
- **Raw SQL for pgvector**: the embedding processor uses `db.execute(sql\`UPDATE courses SET topic_embedding = ${literal}::vector ...\`)`. Drizzle's `.update().set()` does not cleanly handle the `::vector` cast. Keep this as raw SQL.
- **Processors are pure functions** (`processCourseGeneration`, `processEmbedding`) taking `(data, deps)` — keep them transport-agnostic so tests can call them directly.
- **Graceful shutdown**: `main.ts` registers `SIGTERM`/`SIGINT` handlers that call `app.close()` and `queueProvider.close()`. Preserve this pattern.

---

## Anti-patterns to avoid

- Do not add non-task HTTP endpoints to this service.
- Do not call LLM providers directly — always go through `AgentClient`.
- Do not write `status = 'ready'` or `status = 'failed'` outside of this service.
- Do not insert module rows outside of the course-generation DB transaction.
- Do not swallow processor errors in routes — the status-code contract is how the queue knows to retry.

---

## Commands / workflows

```bash
# From monorepo root
pnpm dev                                    # start all services including worker

# Worker only
pnpm --filter @autodidact/worker dev

# Tests
pnpm --filter @autodidact/worker test
```

---

## Key Decisions

- [ADR-027 — Background job queue — migrate to GCP Cloud Tasks](../../docs/architecture/ADRs/services/worker/ADR-027-background-job-queue-cloud-tasks.md) (supersedes ADR-007's BullMQ + Redis)
- [ADR-009 — External vendor abstraction](../../docs/architecture/ADRs/packages/providers/ADR-009-external-vendor-abstraction.md) (queue provider via factory)
- [ADR-008 — ORM / data access layer](../../docs/architecture/ADRs/packages/db/ADR-008-orm-data-access.md) (Drizzle for course/module writes)
