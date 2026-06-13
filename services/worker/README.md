# Worker Service

## Purpose

Background task handler for Autodidact. Handles the two async workloads that are too slow or expensive to run in the request/response cycle: course generation and embedding computation.

## Role in System

```
Cloud Tasks (prod) / loopback provider (dev)
      │
      ▼ POST /tasks/:name  (OIDC-authenticated via Cloud Run IAM in prod)
Worker Service ──▶ Agent Service (:3001)   [generate course, generate embedding]
               ──▶ PostgreSQL              [save course, modules, embedding vector]
               ──▶ Cloud Tasks             [enqueue embedding task after course gen]
```

The Worker is a thin Fastify HTTP service, internal only — its `/tasks/:name` endpoints are invoked per-task by the queue, never by clients. It scales to zero between tasks. It is the only service that writes the full course blueprint and module rows to the database.

## Responsibilities

- Handle `POST /tasks/generate-course` task deliveries
- Update course status through `pending → generating → ready` (or `failed` on retry exhaustion)
- Save course blueprint and all module rows in a single DB transaction
- Enqueue the follow-up `generate-embedding` task after successful course generation
- Handle `POST /tasks/generate-embedding` task deliveries
- Call the Agent service to generate topic embedding vectors
- Store vectors in PostgreSQL via pgvector raw SQL

## Inputs / Outputs

**Inputs** (task POSTs)

| Endpoint | Queue | Payload |
|----------|-------|---------|
| `POST /tasks/generate-course` | `autodidact-course-generation` | `{ courseId, userId, topic, difficulty, moduleCount }` |
| `POST /tasks/generate-embedding` | `autodidact-embedding` | `{ courseId, topic }` |

Tasks are created by the API service (`CoursesService`) when a new course request arrives without a similarity match, and by this service for the embedding follow-up.

**Outputs**

| Target | What |
|--------|------|
| PostgreSQL | `courses` status update (generating → ready / failed), `modules` rows inserted |
| PostgreSQL | `courses.topic_embedding` set via raw SQL |
| Cloud Tasks | `generate-embedding` task enqueued after successful course generation |

## Internal Components

| Component | Path | Description |
|-----------|------|-------------|
| **App (HTTP layer)** | `src/app.ts` | Fastify routes, payload validation, retry/terminal-failure semantics. |
| **processCourseGeneration** | `src/processors/course-generation.processor.ts` | Pure processing function for course generation. |
| **processEmbedding** | `src/processors/embedding.processor.ts` | Pure processing function for embeddings. |
| **AgentClient** | `src/services/agent.client.ts` | HTTP client for Agent service. Methods: `generateCourse()`, `generateEmbedding()`. |

## Key Flows

### Course generation task

```
POST /tasks/generate-course { courseId, userId, topic, difficulty, moduleCount }
  1. UPDATE courses SET status='generating'
  2. agentClient.generateCourse(data) → CourseBlueprint
  3. DB transaction:
       a. UPDATE courses SET title, description, difficulty, estimatedHours,
                             status='ready', blueprint
       b. INSERT modules (one row per ModuleBlueprint)
  4. queueProvider.enqueue(EMBEDDING, { courseId, topic })
  → 204
```

On a throw: the handler returns `500` so Cloud Tasks retries (queue config: 3 attempts, 5 s → 125 s backoff). On the **final** attempt (`X-CloudTasks-TaskRetryCount` ≥ `TASK_MAX_ATTEMPTS - 1`, or no header — loopback), the course is marked `status='failed'` and the task is acknowledged with `200` so the user is never left with a course stuck in `generating`.

### Embedding task

```
POST /tasks/generate-embedding { courseId, topic }
  1. agentClient.generateEmbedding(topic) → number[]
  2. db.execute(sql`
       UPDATE courses
       SET topic_embedding = ${vectorLiteral}::vector, updated_at = NOW()
       WHERE id = ${courseId}::uuid
     `)
  → 204
```

Raw `execute()` is used instead of Drizzle's `.update().set()` because Drizzle's custom vector column type does not handle the `::vector` cast cleanly in parameterised queries. Embedding failures never change course status — the course stays `ready`; only similarity reuse is degraded.

### Task chaining

```
generate-course completes
      └──▶ enqueue generate-embedding
                   └──▶ topic_embedding stored on courses row
                              └──▶ course becomes eligible for reuse (similarity search)
```

## Run / Dev Notes

```bash
# From monorepo root
pnpm dev                              # starts all services including worker

# Worker only
pnpm --filter @autodidact/worker dev

# Tests
pnpm --filter @autodidact/worker test
```

**Environment variables**:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AGENT_SERVICE_URL` | Internal URL of Agent service (default: `http://localhost:3001`) |
| `WORKER_PORT` | HTTP port for the task endpoints (default: `3002`; `8080` on Cloud Run) |
| `TASK_MAX_ATTEMPTS` | Mirrors `max_attempts` in the Cloud Tasks queue retry_config (default: `3`) |
| `QUEUE_PROVIDER` | `loopback` (dev default) \| `cloudtasks` (prod) — for the embedding follow-up enqueue |
| `WORKER_TASK_BASE_URL` | Where enqueued tasks are POSTed (the worker's own URL) |

**Deployment note**: the worker scales to zero (`min_instances = 0`) — Cloud Tasks pushes tasks over HTTP, so there is no queue to poll and no cold-start backlog concern.

See also:
- [Processors](src/processors/README.md)

## Key Decisions

- [ADR-027 — Background job queue — migrate to GCP Cloud Tasks](../../docs/architecture/ADRs/services/worker/ADR-027-background-job-queue-cloud-tasks.md)
- [ADR-009 — External vendor abstraction](../../docs/architecture/ADRs/packages/providers/ADR-009-external-vendor-abstraction.md)
- [ADR-008 — ORM / data access layer](../../docs/architecture/ADRs/packages/db/ADR-008-orm-data-access.md)
