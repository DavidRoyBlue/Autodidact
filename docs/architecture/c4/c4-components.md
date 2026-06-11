# C4 Level 3 — Components

This diagram zooms into each service container and shows its internal components, their responsibilities, and the relationships between them.

---

## API Service Components

```mermaid
graph TD
    subgraph "API Service (NestJS)"
        AM[AppModule<br/>Root NestJS module]
        AUTH[AuthModule<br/>JWT verification]
        COURSES[CoursesModule<br/>Course lifecycle]
        CHAT[ChatModule<br/>SSE chat proxy]
        PROG[ProgressModule<br/>Module unlock]
        HEALTH[HealthController<br/>GET /health]
        COMMON[Common Utilities<br/>ZodValidationPipe<br/>AllExceptionsFilter<br/>@CurrentUser decorator]
        AC[ApiAgentClient<br/>HTTP client to Agent service]
    end

    AM --> AUTH
    AM --> COURSES
    AM --> CHAT
    AM --> PROG
    AM --> HEALTH
    COURSES --> AC
    CHAT --> AC
    COURSES --> PROG
    CHAT --> PROG
```

| Component | Files | Responsibility |
|-----------|-------|----------------|
| **AuthModule** | `modules/auth/` | Provides `AuthGuard` (guards all routes). Delegates JWT verification to `IAuthProvider`. Injects `AuthUser` into request via `@CurrentUser()`. |
| **CoursesModule** | `modules/courses/` | `POST /courses` — semantic similarity check then enroll or enqueue. `GET /courses` — user's enrolled courses. `GET /courses/:id` — course with modules. `POST /courses/:id/enroll`. `GET /courses/status/:jobId` — job polling. |
| **ChatModule** | `modules/chat/` | `POST /chat/sessions` — creates `chat_session` row. `POST /chat/sessions/:id/stream` — appends user message, proxies Agent SSE, persists assistant message, triggers completion logic. |
| **ProgressModule** | `modules/progress/` | `GET /progress/:courseId` — module progress list. `POST /progress/:moduleId/start`. Called internally by ChatModule to complete modules and unlock the next. |
| **ApiAgentClient** | `services/agent.client.ts` | Thin HTTP wrapper for the Agent service. Methods: `generateEmbedding(text)`, `streamChat(body)`. Reads `AGENT_SERVICE_URL` env var. |
| **Common Utilities** | `common/` | `ZodValidationPipe` — validates request bodies against Zod schemas. `AllExceptionsFilter` — normalises all errors to structured JSON. `@CurrentUser()` — parameter decorator extracting `req.user`. |

---

## Agent Service Components

```mermaid
graph TD
    subgraph "Agent Service (Fastify)"
        MAIN[main.ts<br/>Fastify bootstrap]
        GCR[/generate-course<br/>POST route]
        MCR[/module-chat/stream<br/>POST SSE route]
        EMB[/embeddings/text<br/>POST route]

        subgraph "LangGraph Graphs"
            CGG[CourseGenerationGraph<br/>generateBlueprint node]
            MCG[ModuleChatGraph<br/>teacher + evaluator nodes]
        end
    end

    MAIN --> GCR
    MAIN --> MCR
    MAIN --> EMB
    GCR --> CGG
    MCR --> MCG
```

| Component | Files | Responsibility |
|-----------|-------|----------------|
| **CourseGenerationGraph** | `graphs/course-generation/` | LangGraph `StateGraph`. Single node: `generateBlueprint`. Calls LLM with curriculum designer system prompt, extracts JSON, validates against `CourseBlueprintSchema`. Retries up to 3 times on parse failure. |
| **ModuleChatGraph** | `graphs/module-chat/` | LangGraph `StateGraph`. Two nodes: `teacher` and `evaluator`. Teacher node invokes LLM with module system prompt; detects `[MODULE_COMPLETE:score=N]` signal. Evaluator node scores the conversation. Checkpointed by `thread_id` (= session UUID). |
| **GenerateCourseRoute** | `routes/generate-course.ts` | `POST /generate-course` — validates body, runs `CourseGenerationGraph`, returns `{ blueprint }`. |
| **ModuleChatRoute** | `routes/module-chat.ts` | `POST /module-chat/stream` — sets SSE headers, streams graph output token-by-token, reads final state to emit `module_complete` event. |
| **EmbeddingsRoute** | `routes/embeddings.ts` | `POST /embeddings/text` — calls `IEmbeddingProvider.embed(text)`, returns `{ embedding: number[] }`. |

---

## Worker Service Components

```mermaid
graph TD
    subgraph "Worker Service (task handler)"
        MAIN[main.ts<br/>Worker bootstrap]
        APP[app.ts<br/>Fastify task routes /tasks/:name]
        CGP[processCourseGeneration<br/>generate-course tasks]
        EP[processEmbedding<br/>generate-embedding tasks]
        WAC[WorkerAgentClient<br/>HTTP client to Agent]
    end

    MAIN --> APP
    APP --> CGP
    APP --> EP
    CGP --> WAC
    EP --> WAC
    CGP -->|enqueues follow-up task| EP
```

| Component | Files | Responsibility |
|-----------|-------|----------------|
| **App (task routes)** | `app.ts` | Fastify routes `POST /tasks/generate-course` and `POST /tasks/generate-embedding`. Validates payloads (Zod), maps failures to retry (5xx) or terminal failure (marks course `failed` on the final attempt). |
| **processCourseGeneration** | `processors/course-generation.processor.ts` | Updates course status `pending → generating`. Calls Agent `/course/generate`. Saves blueprint + modules in a DB transaction (`status → ready`). Enqueues the `generate-embedding` follow-up task. |
| **processEmbedding** | `processors/embedding.processor.ts` | Calls Agent `/embeddings/text`. Stores `topic_embedding` vector via raw SQL (`::vector` cast). |
| **WorkerAgentClient** | `services/agent.client.ts` | Typed HTTP wrapper. `generateCourse(data)`, `generateEmbedding(topic)`. Reads `AGENT_SERVICE_URL`. |

---

## Shared Package Components (cross-cutting)

```mermaid
graph LR
    API[API Service] --> PROV[providers]
    AGENT[Agent Service] --> PROV
    WORKER[Worker Service] --> PROV
    API --> DB[db]
    WORKER --> DB
    API --> SCHEMAS[schemas]
    AGENT --> SCHEMAS
    API --> TYPES[types]
    AGENT --> TYPES
    WORKER --> TYPES
    AGENT --> PROMPTS[prompts]
    API --> OBS[observability]
    AGENT --> OBS
    WORKER --> OBS
```

| Package | Key Export | Used By |
|---------|-----------|---------|
| `@autodidact/providers` | `ILLMProvider`, `IEmbeddingProvider`, `IQueueProvider`, `IAuthProvider`, `ICheckpointerProvider` + factory functions | All 3 services |
| `@autodidact/db` | `getDb()`, Drizzle schema tables, `eq`, `sql` etc. | API, Worker |
| `@autodidact/types` | `CourseBlueprint`, `ModuleBlueprint`, `ChatMessage`, `AuthUser`, job data types | All 3 services |
| `@autodidact/schemas` | Zod schemas for request validation | API, Agent |
| `@autodidact/prompts` | System prompts + builders for LLM interactions | Agent only |
| `@autodidact/observability` | `createLogger(service)`, `initTracer(service)` | All 3 services |

---

_Previous: [C4 Level 2 — Containers](c4-containers.md)_

_For code-level detail on individual folders, see the README.md inside each subfolder (e.g., `services/agent/src/graphs/module-chat/README.md`)._
