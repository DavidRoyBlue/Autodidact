# Subtree Instructions — services/worker/src/processors/

> These rules apply only within `services/worker/src/processors/`. They extend `services/worker/CLAUDE.md`.

## Purpose of this subtree

Pure task-processing functions. Each file exports a `process*(data, deps)` function with no transport coupling — the Fastify routes in `../app.ts` own HTTP, validation, and retry semantics, and call these per task delivery.

| File | Function | Task endpoint |
|------|----------|---------------|
| `course-generation.processor.ts` | `processCourseGeneration` | `POST /tasks/generate-course` |
| `embedding.processor.ts` | `processEmbedding` | `POST /tasks/generate-embedding` |

---

## Course generation processor

### Task payload

```typescript
CourseGenerationJobData {
  courseId:    string   // UUID of the pre-created courses row
  userId:      string   // UUID of the requesting user
  topic:       string   // raw topic string from the user
  difficulty:  string   // e.g. 'beginner' | 'intermediate' | 'advanced'
  moduleCount: number   // number of modules to generate
}
```

### Processor steps

```
1. UPDATE courses SET status='generating'             (outside transaction)
2. agentClient.generateCourse(data) → CourseBlueprint (HTTP POST to Agent /course/generate)
3. DB transaction:
     a. DELETE modules WHERE course_id = $courseId    (idempotency — see below)
     b. UPDATE courses SET title, description, difficulty, estimatedHours,
                           status='ready', blueprint
     c. INSERT modules (one row per ModuleBlueprint from blueprint.modules)
4. RAG indexing of module chunks — best-effort, never fails the task (ADR-024)
5. queueProvider.enqueue(QUEUES.EMBEDDING, JOB_NAMES.GENERATE_EMBEDDING,
                          { courseId, topic })
```

### Status lifecycle

```
pending     (API inserted the course row)
  │ task delivered
  ▼
generating  (step 1 — marks it in-flight)
  │ steps 2–3 succeed
  ▼
ready       (step 3a — set inside the DB transaction)
  │ step 5 enqueues embedding task
  ▼
  [topic_embedding populated by processEmbedding]

generating ──(final attempt fails)──▶ failed
  (set by ../app.ts markCourseFailed, guarded with status IN ('pending','generating'))
```

### Idempotency on retry

Cloud Tasks redelivers the task on any non-2xx response (queue config: 3 attempts, min backoff 5 s doubling to a 125 s cap). A retry can arrive with modules **already committed**: if the previous attempt failed *after* the ready-transaction (e.g. on the follow-up embedding enqueue — a remote API call), the route returned 500 and the whole task re-runs.

The transaction therefore deletes the course's existing modules before re-inserting (step 3a). Combined with atomicity (`status='ready'` and the module rows commit together), a re-run always replaces the module set rather than appending a duplicate one.

### Error handling

Any throw propagates to the route handler in `../app.ts`:
- **Non-final attempt** → `500`, Cloud Tasks retries.
- **Final attempt** (`X-CloudTasks-TaskRetryCount >= TASK_MAX_ATTEMPTS - 1`, or no header — loopback) → course marked `failed`, task acknowledged with `200`. No course is ever left stuck in `generating`.

Do not catch-and-swallow errors inside the processor — the status-code contract in `../app.ts` is how the queue knows to retry.

---

## Embedding processor

### Task payload

```typescript
EmbeddingJobData {
  courseId: string  // UUID of the courses row (must be status='ready')
  topic:    string  // topic string to embed
}
```

### Processor steps

```
1. agentClient.generateEmbedding(topic) → number[] (1536 floats)
2. vectorLiteral = `[${vector.join(',')}]`
3. db.execute(sql`
     UPDATE courses
     SET topic_embedding = ${vectorLiteral}::vector,
         updated_at = NOW()
     WHERE id = ${courseId}::uuid
   `)
```

### Why raw SQL

Drizzle's `.update().set()` does not cleanly handle the `::vector` cast for parameterised pgvector values. The `sql` tagged template with `db.execute()` passes the vector as a literal string, bypassing this limitation. Do not convert this to a Drizzle fluent query.

### Invariants

- The `courses` row must already exist with `status = 'ready'` before this runs (guaranteed by task chaining: embedding is only enqueued after the course generation transaction commits).
- Do not write any other course columns from this processor — it sets only `topic_embedding` and `updated_at`.
- Embedding failure never changes course status — on the final attempt the route just acknowledges; the course stays `ready` with similarity reuse degraded.

---

## Retry configuration (both task types)

Owned by the Cloud Tasks queue config in `infra/modules/cloud-tasks/main.tf` (`max_attempts = 3`, backoff 5 s → 125 s) — not application code. `TASK_MAX_ATTEMPTS` in the worker env must mirror `max_attempts`. The loopback dev provider performs a single attempt, treated as final.
