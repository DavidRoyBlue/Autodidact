# Agent Service

## Purpose

The internal AI runtime for Autodidact. Runs all LangGraph graphs and handles all LLM interactions. Never exposed to the public internet.

## Role in System

```
API Service ──▶ Agent Service (:3001) ──▶ LLM Provider (OpenAI / Anthropic)
                                      ──▶ PostgreSQL (checkpoints, prod only)
Worker Service ──▶ Agent Service
```

The Agent service is a stateless HTTP server with one stateful concern: LangGraph conversation checkpoints. All callers are internal services (API and Worker). The mobile app never contacts this service directly.

## Responsibilities

- Generate structured course blueprints using a LangGraph graph + LLM
- Teach module content through a stateful, checkpointed conversation graph
- Generate text embeddings for course topic similarity search
- Stream AI responses token-by-token via Server-Sent Events

## Inputs / Outputs

**HTTP API** (port 3001, **internal only**)

| Method | Path | Caller | Description |
|--------|------|--------|-------------|
| POST | `/course/generate` | Worker | Run course generation graph, return blueprint JSON |
| POST | `/module-chat/stream` | API | Run module chat graph, stream SSE response |
| POST | `/embeddings/text` | API, Worker | Generate embedding vector for a text string |
| GET | `/health` | Infra | Liveness check |
| GET | `/ready` | Infra | Readiness check — 200 once providers init and the checkpoint store answers `ping()`, else 503 |

**SSE event protocol** (`/module-chat/stream`)

| Event type | Payload | Description |
|------------|---------|-------------|
| `token` | `{ content: string }` | A streamed chunk of the AI response |
| `module_complete` | `{ score: number }` | Module completion with evaluator score (0–100) |
| `complete` | — | Stream finished successfully |
| `error` | `{ error: string }` | Error during streaming |

**LLM calls**

Every request to `/course/generate` and `/module-chat/stream` triggers at least one LLM call. The number of calls per chat turn:
- Normal turn: 1 (teacher node)
- Completion turn: 2 (teacher node + evaluator node)

## Internal Components

| Component | Path | Description |
|-----------|------|-------------|
| **CourseGenerationGraph** | `src/graphs/course-generation/` | StateGraph with a single `generateBlueprint` node. Retries up to 3×. |
| **ModuleChatGraph** | `src/graphs/module-chat/` | StateGraph with `teacher` and `evaluator` nodes. Checkpointed. |
| **GenerateCourseRoute** | `src/routes/generate-course.ts` | Validates body, invokes graph, returns blueprint. |
| **ModuleChatRoute** | `src/routes/module-chat.ts` | Sets SSE headers, streams graph output, emits completion event. |
| **EmbeddingsRoute** | `src/routes/embeddings.ts` | Calls embedding provider, returns float vector. |

## Key Flows

### Course generation

```
POST /course/generate { courseId, userId, topic, difficulty, moduleCount }
  1. Build CourseGenerationGraph (llmProvider injected)
  2. Invoke graph.invoke({ topic, difficulty, moduleCount, retryCount: 0 })
  3. generateBlueprint node:
       a. LLM call with COURSE_GENERATION_SYSTEM_PROMPT
       b. Extract JSON (strip markdown code fences if present)
       c. CourseBlueprintSchema.safeParse(json)
       d. Success → return { blueprint }
       e. Failure → retryCount + 1, loop (max 3)
  4. Return { blueprint: CourseBlueprint }
```

### Module chat (streaming)

```
POST /module-chat/stream { sessionId, message, moduleBlueprint, courseProgress }
  1. Build ModuleChatGraph (llmProvider + checkpointerProvider injected)
  2. Config: { configurable: { thread_id: sessionId } }   ← LangGraph checkpoint key
  3. graph.stream(inputState, { ...config, streamMode: 'messages' })
  4. For each [message, meta]:
       emit SSE event { type: 'token', content }
  5. graph.getState(config) → check completionSignaled
  6. If true → emit { type: 'module_complete', score }
  7. emit { type: 'complete' }
  8. reply.raw.end()
```

### Completion detection

The teacher LLM is instructed to append `[MODULE_COMPLETE:score=N]` when the student has demonstrated understanding. The `teacher` node extracts this with a regex, strips it from the response text (so the user never sees the marker), and sets `completionSignaled: true`. The graph then routes to the `evaluator` node for a second LLM call that produces a structured score.

## Run / Dev Notes

```bash
# From monorepo root
pnpm dev                              # starts all services including agent

# Agent only
pnpm --filter @autodidact/agent dev

# Tests
pnpm --filter @autodidact/agent test
```

**Environment variables**:

| Variable | Description |
|----------|-------------|
| `AGENT_PORT` | HTTP port (default 3001) |
| `LLM_PROVIDER` | `openai` (default) or `anthropic` |
| `OPENAI_API_KEY` | Required if LLM_PROVIDER=openai |
| `ANTHROPIC_API_KEY` | Required if LLM_PROVIDER=anthropic |
| `EMBEDDING_PROVIDER` | `openai` (default) |
| `CHECKPOINTER` | `memory` (default, dev) or `postgres` (prod) |
| `DATABASE_URL` | Required if CHECKPOINTER=postgres |

**Checkpointer note**: In development, `MemorySaver` keeps conversation history in process memory. Restarting the agent service clears all conversation state. In production, set `CHECKPOINTER=postgres` to persist conversation history in the database, enabling multi-instance scaling.

See also:
- [Graphs: Course Generation](src/graphs/course-generation/README.md)
- [Graphs: Module Chat](src/graphs/module-chat/README.md)
- [Routes](src/routes/README.md)

## Key Decisions

- [ADR-005 — AI agent server framework](../../docs/architecture/ADRs/services/agent/ADR-005-ai-agent-server-framework.md) (Fastify)
- [ADR-006 — AI orchestration framework](../../docs/architecture/ADRs/services/agent/ADR-006-ai-orchestration-framework.md) (LangGraph)
- [ADR-011 — Real-time streaming transport](../../docs/architecture/ADRs/services/agent/ADR-011-realtime-streaming-transport.md) (SSE)
- [ADR-009 — External vendor abstraction](../../docs/architecture/ADRs/packages/providers/ADR-009-external-vendor-abstraction.md) (LLM/embedding/checkpointer providers)
