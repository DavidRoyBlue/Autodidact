# Processors

Pure task-processing functions, free of any transport concern. Each exports a `process*` function taking `(data, deps)`; the Fastify routes in `src/app.ts` validate the payload and call them per task delivery.

## Files

| File | Function | Task endpoint |
|------|----------|---------------|
| `course-generation.processor.ts` | `processCourseGeneration` | `POST /tasks/generate-course` |
| `embedding.processor.ts` | `processEmbedding` | `POST /tasks/generate-embedding` |

---

## Course Generation Processor

**Payload**: `CourseGenerationJobData { courseId, userId, topic, difficulty, moduleCount }`

### Status lifecycle

```
courses.status transitions:
  pending
    │ (task delivered)
    ▼
  generating
    │ (Agent call + DB write succeed)
    ▼
  ready
    │ (embedding task enqueued automatically)
    ▼
  [topic_embedding set by embedding processor]

  generating ──(final attempt fails)──▶ failed   (set by src/app.ts, not the processor)
```

A throw propagates to the route handler in `src/app.ts`: non-final attempts return `500` so Cloud Tasks retries; the final attempt marks the course `failed` (guarded with `status IN ('pending','generating')` so a committed `ready` course is never flipped back) and acknowledges the task.

### DB transaction

Course and module rows are written atomically:

```typescript
await db.transaction(async (tx) => {
  await tx.update(courses).set({
    title, description, difficulty,
    estimatedHours, status: 'ready', blueprint,
  }).where(eq(courses.id, courseId));

  await tx.insert(modules).values(moduleRows);
});
```

If either operation fails, neither is committed and the transaction rolls back. Re-running the processor on a retried task is safe: if the task failed, the transaction did not commit, so the course is still `generating` with no module rows.

### Task chaining

After a successful transaction, the processor enqueues an embedding task:

```typescript
await queueProvider.enqueue(QUEUES.EMBEDDING, JOB_NAMES.GENERATE_EMBEDDING, { courseId, topic });
```

Retry/backoff for that task is owned by the Cloud Tasks queue config, not enqueue options.

---

## Embedding Processor

**Payload**: `EmbeddingJobData { courseId, topic }`

### What it does

```typescript
1. agentClient.generateEmbedding(topic) → number[] (1536 floats)
2. vectorLiteral = `[${vector.join(',')}]`
3. db.execute(sql`
     UPDATE courses
     SET topic_embedding = ${vectorLiteral}::vector,
         updated_at = NOW()
     WHERE id = ${courseId}::uuid
   `)
```

Idempotent — safe to retry any number of times. A failed embedding never changes course status; the course stays `ready` and only similarity reuse is degraded.

### Why raw SQL

Drizzle's `.update().set()` does not cleanly handle the `::vector` cast on parameterised values. The `sql` tagged template literal with `db.execute()` bypasses this limitation by passing the vector as a literal string.

The `courses` row must already exist and have `status = 'ready'` before this runs (guaranteed by task chaining order).

---

## Retry Configuration

Queue-level, in Terraform (`infra/modules/cloud-tasks/main.tf`):

```hcl
retry_config {
  max_attempts  = 3
  min_backoff   = "5s"
  max_backoff   = "125s"
  max_doublings = 5
}
```

The worker mirrors `max_attempts` via `TASK_MAX_ATTEMPTS` to detect the final attempt (`X-CloudTasks-TaskRetryCount` header). The loopback dev provider sends no header — every dispatch counts as the single, final attempt.
