# Routes

HTTP route handlers for the Agent service. All routes are registered in `main.ts` at startup. All routes are internal (not publicly accessible).

## Files

| File | Route | Caller |
|------|-------|--------|
| `generate-course.ts` | `POST /generate-course` | Worker service |
| `module-chat.ts` | `POST /module-chat/stream` | API service |
| `embeddings.ts` | `POST /embeddings/text` | API service, Worker service |

---

## POST /generate-course

Runs the `CourseGenerationGraph` and returns the blueprint.

**Request body**:
```typescript
{
  courseId:    string (UUID),
  userId:      string (UUID),
  topic:       string,
  difficulty:  'beginner' | 'intermediate' | 'advanced',
  moduleCount: number,
}
```

**Response** (200):
```typescript
{
  blueprint: CourseBlueprint
}
```

**Error** (500): If the graph fails all 3 retries, the route throws; the worker surfaces the failure and Cloud Tasks retries the task.

---

## POST /module-chat/stream

Runs the `ModuleChatGraph` with streaming enabled. Returns an SSE stream.

**Request body**:
```typescript
{
  sessionId:      string (UUID),   // LangGraph thread_id
  message:        string (1–4000 chars),
  moduleBlueprint: ModuleBlueprint,
  courseProgress: {
    courseTitle:           string,
    completedModuleCount:  number,
    totalModuleCount:      number,
  },
  isFirstMessage?: boolean,
}
```

**Response headers**:
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no          ← disables nginx response buffering
```

**SSE event protocol**:

| Event type | Payload | Description |
|------------|---------|-------------|
| `token` | `{ type: 'token', content: string }` | Streamed LLM response chunk |
| `module_complete` | `{ type: 'module_complete', score: number }` | Emitted when `completionSignaled` is true in final state |
| `complete` | `{ type: 'complete' }` | Stream finished, connection can be closed |
| `error` | `{ type: 'error', error: string }` | Unhandled exception during streaming |

Events are JSON-serialised and written as `data: {...}\n\n`.

---

## POST /embeddings/text

Generates a text embedding vector.

**Request body**:
```typescript
{
  text: string
}
```

**Response** (200):
```typescript
{
  embedding: number[]   // 1536 floats (OpenAI text-embedding-3-small)
}
```

This route is called on:
1. Every `POST /courses` request (API service, for similarity search)
2. Every `GENERATE_EMBEDDING` job (Worker service, for storing the vector)

---

## Common Patterns

**Error handling**: All routes wrap their logic in `try/catch`. On error, they emit `{ type: 'error', error: String(err) }` for SSE routes and let Fastify's default error handler respond with 500 for non-SSE routes.

**No auth**: The Agent service is internal and does not verify JWTs. Network-level access control (Cloud Run internal-only setting) is the security boundary.

**Graph reuse**: The `ModuleChatGraph` is built once and shared across all requests (`buildModuleChatGraph()` is called once in `main.ts`). The graph is stateless at the object level — per-request state lives in the LangGraph checkpointer keyed by `thread_id`.
