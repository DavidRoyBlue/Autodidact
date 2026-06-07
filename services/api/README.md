# API Service

## Purpose

The public-facing HTTP API for Autodidact. It is the only service that the mobile app communicates with directly.

## Role in System

```
Mobile App
    │
    ▼ HTTPS REST + SSE
API Service (:3000)
    ├──▶ Agent Service (:3001)   [internal HTTP — embeddings, chat stream]
    ├──▶ Redis                   [BullMQ job enqueue]
    └──▶ PostgreSQL              [course data, enrollments, progress, sessions]
```

The API owns the authentication boundary. Every request is verified against a Supabase JWT before reaching business logic. The API does not run AI models — it orchestrates work to the Agent and Worker services.

## Responsibilities

- Verify Supabase JWT tokens on every protected endpoint
- Manage the course lifecycle: semantic similarity check → enroll or enqueue generation
- Proxy Server-Sent Events from the Agent service to the mobile app
- Persist chat session messages to the database
- Track per-user module progress (started, completed, unlock next)
- Expose a job status polling endpoint for in-progress course generation

## Inputs / Outputs

**HTTP API** (port 3000, public)

All routes are prefixed with `/v1` (set in `main.ts` via `app.setGlobalPrefix('v1')`).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/health` | None | Liveness check — returns db + agent probe results |
| POST | `/v1/courses` | JWT | Create or reuse a course (similarity-deduplicated) |
| GET | `/v1/courses` | JWT | List the authenticated user's enrolled courses |
| GET | `/v1/courses/status/:jobId` | JWT | Poll background generation job status |
| GET | `/v1/courses/:id` | JWT | Course detail with ordered module list |
| POST | `/v1/courses/:id/enroll` | JWT | Enroll the authenticated user in a course |
| POST | `/v1/chat/sessions` | JWT | Create a chat session for a module |
| GET | `/v1/chat/sessions/:id` | JWT | Get a chat session with message history |
| POST | `/v1/chat/sessions/:id/stream` | JWT | Stream a chat response (SSE) |
| GET | `/v1/progress/:courseId` | JWT | Module progress list for a course |

**Outbound calls**

| Target | Call | When |
|--------|------|------|
| Agent service | `POST /embeddings/text` | Every `POST /courses` request |
| Agent service | `POST /module-chat/stream` | Every chat stream request |
| Redis (BullMQ) | Enqueue `GENERATE_COURSE` | New course (no similarity match) |
| PostgreSQL | Read/write | All business logic |

## Examples

### Authentication header

All protected endpoints require a Supabase JWT in the `Authorization` header:

```
Authorization: Bearer <supabase-jwt>
```

---

### POST /v1/courses — create or reuse a course

**Request**
```json
{
  "topic": "Introduction to Rust",
  "difficulty": "beginner",
  "moduleCount": 5
}
```

Validation: `topic` 3–200 chars; `difficulty` one of `beginner` | `intermediate` | `advanced` (default `beginner`); `moduleCount` integer 3–20 (default 5).

**Response — new course enqueued for generation**
```json
{
  "courseId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "reused": false
}
```

**Response — similar course found (cosine similarity ≥ 0.92), enrollment created**
```json
{
  "courseId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "status": "ready",
  "reused": true
}
```

Poll `GET /v1/courses/status/:jobId` while `status === "pending"`.

---

### GET /v1/courses/status/:jobId — poll job status

**Response**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed"
}
```

`status` values: `waiting` | `active` | `completed` | `failed` | `unknown`

---

### POST /v1/chat/sessions — create a chat session

**Request**
```json
{
  "moduleId": "7c9e6679-7425-40de-944b-e07fc1f90ae7"
}
```

**Response**
```json
{
  "id": "a3bb189e-8bf9-3888-9912-ace4e6543002",
  "userId": "user-uuid",
  "moduleId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "threadId": "thread-uuid",
  "messages": [],
  "createdAt": "2026-06-05T12:00:00.000Z"
}
```

---

### GET /v1/chat/sessions/:id — get session with message history

**Response**
```json
{
  "id": "a3bb189e-8bf9-3888-9912-ace4e6543002",
  "userId": "user-uuid",
  "moduleId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "threadId": "thread-uuid",
  "messages": [
    { "role": "user", "content": "What is ownership in Rust?" },
    { "role": "assistant", "content": "Ownership is Rust's memory management model..." }
  ],
  "createdAt": "2026-06-05T12:00:00.000Z"
}
```

---

### POST /v1/chat/sessions/:id/stream — stream a chat response (SSE)

Uses Server-Sent Events. Send the message in the POST body using `@microsoft/fetch-event-source` (standard `EventSource` does not support POST with a body).

**Request**
```json
{
  "content": "What is ownership in Rust?"
}
```

**Response (SSE, `Content-Type: text/event-stream`)**
```
data: {"type":"token","content":"Ownership"}

data: {"type":"token","content":" is Rust's memory"}

data: {"type":"module_complete","score":72}

data: {"type":"complete"}
```

A `module_complete` event with `score >= 60` marks the module completed and unlocks the next one.

---

### GET /v1/progress/:courseId — module progress for a course

**Response**
```json
[
  { "moduleId": "uuid-0", "title": "Variables and Types", "position": 0, "status": "completed" },
  { "moduleId": "uuid-1", "title": "Ownership and Borrowing", "position": 1, "status": "available" },
  { "moduleId": "uuid-2", "title": "Structs and Enums", "position": 2, "status": "locked" }
]
```

`status` values: `locked` | `available` | `in_progress` | `completed`

---

### GET /v1/health — liveness check

**Response (all healthy)**
```json
{ "status": "ok", "services": { "db": "ok", "agent": "ok" } }
```

**Response (degraded)**
```json
{ "status": "degraded", "services": { "db": "ok", "agent": "error" } }
```

---

### Error envelope

All errors return a consistent JSON envelope:

```json
{
  "statusCode": 400,
  "timestamp": "2026-06-05T12:00:00.000Z",
  "path": "/v1/courses",
  "error": {
    "message": "Validation failed",
    "errors": [
      { "path": "topic", "message": "String must contain at least 3 character(s)" }
    ]
  }
}
```

Common status codes: `400` validation failed · `401` missing or invalid JWT · `404` resource not found · `500` internal error

---

## Internal Components

| Module | Path | Responsibility |
|--------|------|----------------|
| **AuthModule** | `src/modules/auth/` | `AuthGuard` — verifies JWT, injects `AuthUser` into request |
| **CoursesModule** | `src/modules/courses/` | Course creation, enrollment, listing, job polling |
| **ChatModule** | `src/modules/chat/` | Session creation, SSE streaming proxy, message persistence |
| **ProgressModule** | `src/modules/progress/` | Module status tracking and sequential unlock |
| **AgentClient** | `src/services/agent.client.ts` | HTTP wrapper for Agent service calls |
| **QueueProvider** | injected via `QUEUE_PROVIDER_TOKEN` | BullMQ job enqueue |
| **Common** | `src/common/` | `ZodValidationPipe`, `AllExceptionsFilter`, `@CurrentUser()` |

## Key Flows

### Course creation

```
POST /courses { topic, difficulty, moduleCount }
  1. Call Agent /embeddings/text → float[]
  2. Cosine similarity query (pgvector <=> operator, threshold 0.92)
  3a. Match found → enrollUser(userId, existingCourseId) → return { courseId, status: 'ready', reused: true }
  3b. No match   → INSERT courses (status: 'pending')
                 → BullMQ.enqueue(COURSE_GENERATION, { courseId, topic, ... })
                 → return { courseId, jobId, status: 'pending', reused: false }
```

### Chat streaming

```
POST /chat/sessions/:id/stream { content }
  1. Load session → load module blueprint
  2. Append user ChatMessage to JSONB
  3. fetch(Agent /module-chat/stream) → ReadableStream
  4. Forward SSE tokens to client via RxJS Subject → @Sse observable
  5. Accumulate assistant content
  6. On 'complete' event: persist assistant ChatMessage
  7. If completionScore >= 60: ProgressService.completeModule()
```

### Module completion

```
ProgressService.completeModule(userId, moduleId, courseId, score)
  1. UPDATE module_progress SET status='completed', score=N
  2. UPDATE module_progress SET status='available' WHERE position = completedPosition + 1
  3. If all modules completed → UPDATE enrollments SET completed_at = NOW()
```

## Run / Dev Notes

```bash
# From monorepo root
pnpm dev                          # starts all services including api

# API only
pnpm --filter @autodidact/api dev

# Tests
pnpm --filter @autodidact/api test
```

**Environment variables** (see `.env.example`):

| Variable | Description |
|----------|-------------|
| `API_PORT` | HTTP port (default 3000) |
| `DATABASE_URL` | PostgreSQL connection string |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Admin access key |
| `REDIS_URL` | Redis connection string |
| `AGENT_SERVICE_URL` | Internal URL of Agent service |
| `AUTH_PROVIDER` | `supabase` (default) |
| `QUEUE_PROVIDER` | `bullmq` (default) |

See also:
- [Module: Auth](src/modules/auth/README.md)
- [Module: Courses](src/modules/courses/README.md)
- [Module: Chat](src/modules/chat/README.md)
- [Module: Progress](src/modules/progress/README.md)

## Key Decisions

- [ADR-004 — REST API framework](../../docs/architecture/ADRs/services/api/ADR-004-rest-api-framework.md) (NestJS)
- [ADR-009 — External vendor abstraction](../../docs/architecture/ADRs/packages/providers/ADR-009-external-vendor-abstraction.md)
- [ADR-011 — Real-time streaming transport](../../docs/architecture/ADRs/services/agent/ADR-011-realtime-streaming-transport.md) (SSE proxy)
- [ADR-016 — Runtime schema validation](../../docs/architecture/ADRs/packages/schemas/ADR-016-runtime-schema-validation.md)
- [ADR-020 — Authentication strategy](../../docs/architecture/ADRs/cross-cutting/ADR-020-authentication-strategy.md) (🚩)
