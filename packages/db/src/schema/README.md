# Schema

Drizzle ORM table definitions for all six Autodidact database tables. Each file exports one `pgTable` constant. `index.ts` re-exports them all.

## Files

| File | Table | Description |
|------|-------|-------------|
| `enums.ts` | — | Postgres enum types used across tables |
| `users.ts` | `users` | App user profiles (mirrors Supabase Auth) |
| `courses.ts` | `courses` | Courses with pgvector topic embedding |
| `modules.ts` | `modules` | Individual learning modules within a course |
| `enrollments.ts` | `enrollments` | User ↔ course membership |
| `module_progress.ts` | `module_progress` | Per-user progress through each module |
| `chat_sessions.ts` | `chat_sessions` | AI conversation sessions per module |
| `index.ts` | — | Re-exports all tables |

---

## Enum Types (`enums.ts`)

```typescript
courseStatusEnum:  'pending' | 'generating' | 'ready' | 'failed'
moduleStatusEnum:  'locked' | 'available' | 'in_progress' | 'completed'
difficultyEnum:    'beginner' | 'intermediate' | 'advanced'
timeBudgetEnum:    '30min' | '1h' | '4h' | 'unrestricted'
```

Enums are Postgres native types, created in migration `0001_initial.sql`.

---

## Table Notes

### `courses`

- `topic`: Raw user input (e.g., "Introduction to Rust").
- `slug`: Auto-generated URL-safe version. Not unique-constrained — two courses with similar topics may share a slug.
- `timeBudget`: `'30min' | '1h' | '4h' | 'unrestricted'`, chosen by the learner instead of a module count (ADR-030). Drives the AgentPlatform run's word budget and is part of the reuse key alongside topic embedding and difficulty.
- `topicEmbedding`: 1536-dimensional float vector. **Set asynchronously** via the embedding job, not at course creation. Can be null until the embedding job completes.
- `isPublic`: Controls whether the course is eligible for reuse in similarity searches.

### `modules`

- `position`: 0-indexed. Enforces teaching order. Used in the module unlock SQL query.
- `objectives`: JSONB `string[]`. Passed to the teacher prompt and evaluated by the completion evaluator.
- `content`: TEXT — the full lesson, markdown, as AgentPlatform's `course-creator` workflow wrote it. Included in the teacher prompt; chunked for RAG indexing.
- `resources`: JSONB `ModuleResource[]` — `{ url: string; title: string; why: string }[]`.
- `status`: Generation-time default (`locked`). **This is not per-user.** Per-user progress is in `module_progress.status`.

### `module_progress`

- **Unique constraint**: `(userId, moduleId)`. One progress record per user per module.
- `courseId`: Denormalized from `modules.courseId` for query performance (avoids join on every progress check).
- `chatSessionId`: **Reserved — currently never set.** Intended to link a progress record to its most recent chat session. Planned for Phase 2.
- `completionScore`: 0–100. Set when status transitions to `completed`. The minimum passing score is 60 (enforced in `ChatService`).

### `chat_sessions`

- `messages`: JSONB `ChatMessage[]`. Appended on every turn — not a relational structure. Trade-off: simpler to read/write, harder to query individual messages.
- `threadId`: UUID generated at session creation. Used as LangGraph `thread_id` for conversation checkpointing. **Not the same as the session `id`.** The distinction matters because LangGraph only knows `threadId`, not `id`.
- `isActive`: Default `true`. Currently not used to gate any logic — set for future session management.

---

## Foreign Key Cascade Rules

| Child table | Parent | On Delete |
|-------------|--------|-----------|
| `modules` | `courses` | CASCADE (deleting a course deletes all its modules) |
| `enrollments` | `users`, `courses` | No cascade (enrollment rows orphan on user/course delete) |
| `module_progress` | `users`, `modules`, `courses` | No cascade |
| `chat_sessions` | `users`, `modules` | No cascade |

> Only `modules` has cascade delete. All other FK relationships require explicit cleanup.
