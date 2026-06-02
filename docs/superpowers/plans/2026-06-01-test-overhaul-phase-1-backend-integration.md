# Test Overhaul — Phase 1: Backend Integration Depth — Implementation Plan

> **For agentic workers:** Execute task-by-task via superpowers:subagent-driven-development. Each task is TDD: write failing tests first, implement/verify, commit. Tasks are independent (different packages) — run sequentially to avoid git-index/lockfile conflicts. Steps use `- [ ]`.

**Goal:** Close the backend test gaps Findings A, C, D, E and the smaller tracer/shutdown gaps: promote api chat/courses to real-DB, add worker real-Redis integration + graceful shutdown, provider implementation unit tests, db query-layer integration, the observability tracer test, and the agent `/module-chat` SSE route + graph-composition tests.

**Architecture:** Real-DB/Redis tasks consume the `@autodidact/test-support` harness from Phase 0 (`withTestDatabase`, `withTestRedis`, seed factories). The LLM is the only mock seam. Pure-unit tasks (providers, tracer) mock the vendor SDK at the import boundary. Each task leaves `pnpm test` green.

**Tech Stack:** Vitest, Testcontainers (via test-support), Drizzle, BullMQ, Fastify `inject()`, LangGraph, `@langchain/*` (mocked).

---

## Cross-cutting conventions (every task)

- **`@autodidact/db` has module-load side effects** (constructs a pg `Pool` and a Supabase client at import). Real-DB tests use the Phase-0 pattern: `vi.mock('@autodidact/db', async () => ({ ...realSchema, getDb: () => harness.db, supabaseAdmin: null }))`, importing schema from `../../../../packages/db/src/schema/index.js`. Pure-unit tests that transitively import `@autodidact/db` must ensure the consuming `vitest.config.ts` has the `SUPABASE_URL`/`SUPABASE_SECRET_KEY` env stubs (api and test-support already do; add to others only if needed).
- **TDD:** write the failing test, run it red, implement (or for test-only tasks, confirm it then drives coverage), run green, commit.
- **Verification per task:** `pnpm --filter <pkg> test` green; `pnpm --filter <pkg> typecheck` clean. Do not regress other suites.
- **Mock factories:** use `@autodidact/config/test-utils` canonical mocks where applicable (`makeMockAgentClient`, `makeMockQueueProvider`, `makeMockLLMProvider`, `makeMockLogger`); never hand-roll a mock that already exists.

---

### Task 1: Provider implementation unit tests (Finding D)

**Package:** `packages/providers` (note: vitest here uses a `js-to-ts-resolver` plugin for `@langchain/*` ESM).
**Create:**
- `src/__tests__/openai.provider.test.ts`
- `src/__tests__/anthropic.provider.test.ts`
- `src/__tests__/openai-embedding.provider.test.ts`
- `src/__tests__/cohere-embedding.provider.test.ts`
- `src/__tests__/checkpointer.test.ts`

**Targets & signatures (from recon):**
- `OpenAILLMProvider` (`src/implementations/llm/openai.provider.ts`): ctor `{ apiKey, model?='gpt-4o', temperature?=0.7 }`; `getModel(): BaseChatModel`, `getModelName()`. Mock `@langchain/openai`'s `ChatOpenAI`.
- `AnthropicLLMProvider` (`.../anthropic.provider.ts`): ctor `{ apiKey, model?='claude-opus-4-7', temperature?=0.7 }`; same methods. Mock `@langchain/anthropic`'s `ChatAnthropic`.
- `OpenAIEmbeddingProvider` (`.../embedding/openai-embedding.provider.ts`): ctor `{ apiKey, model?='text-embedding-3-small' }`; `embed(text)`, `embedBatch(texts)`, `getEmbeddings()`. Mock `OpenAIEmbeddings`.
- `CohereEmbeddingProvider`: stub — assert every method throws `'CohereEmbeddingProvider is not yet implemented'` (lock the stub contract so a future impl is a deliberate change).
- `MemoryCheckpointerProvider` / `PostgresCheckpointerProvider` (`.../checkpointer/*`): memory returns a `BaseCheckpointSaver`; postgres `getCheckpointer()` throws before `init()`. Mock the dynamic `@langchain/langgraph-checkpoint-postgres` import; assert the pre-init throw and that `init()` is required.

**Acceptance:** each provider's construction passes the API key + model through to the mocked SDK constructor; `getModelName()` returns the configured model; embedding `embed`/`embedBatch` delegate to the SDK and return its vectors; the key-handling path is exercised (provider passes `apiKey` to the SDK — assert it's forwarded). Do NOT call real vendor APIs.

- [ ] Write failing tests mocking the SDK classes (`vi.mock('@langchain/openai', ...)` etc., using `vi.hoisted` per the repo's existing `factory.test.ts` pattern).
- [ ] Run red → implement is N/A (impls exist); confirm tests assert real behavior, not just the mock. Run green.
- [ ] `pnpm --filter @autodidact/providers test` + `typecheck` green.
- [ ] Commit: `test(providers): unit-test LLM/embedding/checkpointer implementations`.

---

### Task 2: Observability tracer test (smaller gap)

**Package:** `packages/observability`
**Create:** `src/__tests__/tracer.test.ts`
**Target:** `src/tracer.ts` — `initTracer(serviceName): void` (no-op unless `OTEL_EXPORTER_OTLP_ENDPOINT` set), `shutdownTracer(): Promise<void>` (safe no-op if not initialized).

**Acceptance:**
- With `OTEL_EXPORTER_OTLP_ENDPOINT` unset: `initTracer('x')` does not throw and constructs no SDK; `shutdownTracer()` resolves without error.
- With the endpoint set: mock `@opentelemetry/sdk-node` (`NodeSDK`) and assert `start()` is called and `shutdownTracer()` calls `sdk.shutdown()`. Use `vi.resetModules()` + dynamic import between cases to reset the module-level `sdk` singleton; restore env after.

- [ ] Failing test → run red → green (tracer exists). Mock OTEL SDK for the active branch.
- [ ] `pnpm --filter @autodidact/observability test` + `typecheck` green.
- [ ] Commit: `test(observability): cover tracer init/shutdown branches`.

---

### Task 3: db query-layer integration (Finding E)

**Package:** `packages/db` — add a real-DB test using the harness.
**Add devDependency:** `@autodidact/test-support: workspace:*`. Ensure `packages/db/vitest.config.ts` has `SUPABASE_URL`/`SUPABASE_SECRET_KEY` env stubs (the test imports the real client barrel).
**Create:** `src/__tests__/queries.integration.test.ts`

**Acceptance (exercise real pgvector + constraints, not mocks):**
- Insert via Drizzle into `courses`/`modules`/`users` using `harness.db` + schema tables; round-trip select returns inserted values.
- A pgvector round-trip: store a `topic_embedding` (use `sql` with `::vector` cast as the worker does) and read it back / run a `<=>` cosine-distance ordering across 2 rows, asserting nearest-first ordering. This is the highest-value db test (proves the extension + vector column).
- A FK/constraint assertion: inserting a `module` with a non-existent `course_id` rejects; or `enrollments` unique `(user_id, course_id)` upsert via `onConflictDoUpdate` behaves.

Use `withTestDatabase()` in `beforeAll` (90s timeout), `truncate()` in `beforeEach`, `close()` in `afterAll`. Seed via the Phase-0 factories where they fit.

- [ ] Failing test → boot harness → green.
- [ ] `pnpm --filter @autodidact/db test` + `typecheck` green.
- [ ] Commit: `test(db): real-Postgres query + pgvector integration tests`.

---

### Task 4: Worker real-Redis integration + graceful shutdown (Finding C, smaller)

**Package:** `services/worker`. Add `@autodidact/test-support` devDep; add Supabase env stubs to `services/worker/vitest.config.ts` (it imports `@autodidact/db` via processors).
**Create:**
- `src/__tests__/course-generation.integration.test.ts`
- `src/__tests__/embedding.integration.test.ts`
- `src/__tests__/shutdown.test.ts`

**Targets (from recon):**
- `createCourseGenerationWorker(connection: Redis, agentClient, queueProvider, logger): Worker` — processes a real BullMQ job and writes `courses`(status→ready) + `modules` rows in a transaction, then enqueues an embedding job.
- `createEmbeddingWorker(connection: Redis, agentClient, logger): Worker` — writes `courses.topic_embedding` via raw `::vector` SQL.

**Acceptance (real Redis + real DB, mocked agent/LLM):**
- Course-gen: with `withTestRedis()` + `withTestDatabase()`, seed a `users` row + a `courses` row (status `generating`); construct the worker with `new Redis(harnessRedis.url, { maxRetriesPerRequest: null })`, a `makeMockAgentClient()` (returns `sampleBlueprint`), and a real or mock queue provider; enqueue a real job onto `QUEUES.COURSE_GENERATION`; await processing (poll job state / await `worker.on('completed')`); assert the DB shows `status='ready'` and the expected `modules` rows. Close the worker in `afterAll`.
- Embedding: similar; mock agent returns a fixed 1536-vector; assert `courses.topic_embedding` is non-null after processing.
- Shutdown: unit-test the graceful-shutdown semantics. `main.ts` registers SIGTERM/SIGINT → `shutdown()` closing both workers + queue provider then disconnecting Redis. Because importing `main.ts` triggers full bootstrap, EITHER extract the `shutdown` composition into a testable helper (preferred — small refactor: a `createShutdownHandler(workers, queueProvider, redis)` in a new `src/shutdown.ts` that `main.ts` consumes) OR test that calling `worker.close()` drains in-flight jobs. If refactoring, keep `main.ts` behavior identical and assert the handler calls `.close()`/`.disconnect()` on its dependencies and resolves.

- [ ] Failing integration tests → boot harnesses → green. Use generous timeouts (90s) for container + job round-trip.
- [ ] If extracting `createShutdownHandler`, do it TDD and keep `main.ts` wiring unchanged in behavior.
- [ ] `pnpm --filter @autodidact/worker test` + `typecheck` green.
- [ ] Commit(s): `test(worker): real-Redis processor integration` and `refactor(worker): extract testable shutdown handler` if applicable.

---

### Task 5: Agent `/module-chat` SSE route + graph composition (Finding C, highest risk/reward)

**Package:** `services/agent`.
**Create:**
- `src/__tests__/module-chat.route.test.ts`
- `src/__tests__/module-chat.graph.test.ts` (graph composition, complementing existing node tests)

**Targets (from recon):**
- `registerModuleChatRoute(app, llmProvider, checkpointerProvider)` (`src/routes/module-chat.ts`) — SSE via `reply.raw`; emits `{type:'token',content}`, optional `{type:'module_complete',score}`, `{type:'complete'}`, and `{type:'error',error}`. Invokes `graph.stream(inputState, {configurable:{thread_id}, streamMode:'messages'})` then `graph.getState(config)`.
- `buildModuleChatGraph(llmProvider, checkpointerProvider)` (`src/graphs/module-chat/graph.ts`) — START→teacher→conditional(completionSignaled? evaluator : END), compiled with checkpointer.

**Route test approach (Fastify `inject()` buffers `reply.raw` output):**
- `vi.mock('../graphs/module-chat/graph.js', () => ({ buildModuleChatGraph: vi.fn().mockReturnValue(fakeGraph) }))` where `fakeGraph.stream` is an async generator yielding `[{ content: 'Hel' }, meta]`, `[{ content: 'lo' }, meta]`, and `fakeGraph.getState` returns `{ values: { completionSignaled: false } }`. Mirror the existing `generate-course.route.test.ts` mock+inject pattern.
- `registerModuleChatRoute(app, makeMockLLMProvider(), memoryCheckpointer)`; `app.inject({method:'POST', url:'<route path>', payload:{sessionId, ...}})`; parse `res.body` into `data:` frames; assert the ordered event sequence: two `token` events with `Hel`/`lo`, then `complete`. Add a case where `getState` returns `completionSignaled:true, completionScore:85` → asserts a `module_complete` event with score 85 before `complete`. Add an error case: `fakeGraph.stream` throws → a single `error` event.
- Confirm SSE headers (`text/event-stream`) on the response.

**Graph composition test approach:**
- Build the graph with a mock `ILLMProvider` (hand-rolled `getModel().invoke` returning scripted `AIMessage`s) and `MemoryCheckpointerProvider`. Drive `graph.invoke`/`graph.stream` with an input state lacking a completion signal → ends after `teacher` (evaluator not run). Then drive with a teacher message containing `[MODULE_COMPLETE:score=85]` → routes through `evaluator`, final state carries `completionScore`. This tests the wiring/edges, distinct from the existing node-unit tests.

- [ ] Failing route test (mock graph) → green; assert framing + all four event types.
- [ ] Failing graph-composition test → green; assert conditional routing both ways.
- [ ] `pnpm --filter @autodidact/agent test` + `typecheck` green.
- [ ] Commit: `test(agent): SSE module-chat route + graph composition coverage`.

---

### Task 6: Promote api chat & courses to real DB (Finding A)

**Package:** `services/api`. This is the trickiest task — do it last.
**Modify (rename-in-place, real DB):**
- `src/__tests__/chat.service.integration.test.ts`
- `src/__tests__/courses.service.integration.test.ts`

**Approach:** replace the hand-rolled `vi.mock('@autodidact/db')` mock-db with the Phase-0 real-DB pattern (`getDb: () => harness.db`), `withTestDatabase()` in `beforeAll`, `truncate()` + seed factories in `beforeEach`. Keep the LLM/agent/queue seams mocked:
- **ChatService** ctor takes `ProgressService` (construct a real `new ProgressService()` so `completeModule` writes real rows). `streamMessage` calls bare `global.fetch` to the agent — keep `vi.stubGlobal('fetch', ...)` returning a scripted SSE stream (this is the single mock seam; there is no DI for it). Preserve all 5 existing assertions but now against real `chat_sessions`/`modules` rows seeded via factories; additionally assert the real `module_progress`/`enrollments` effect when score≥60 (cross-checked in the DB).
- **CoursesService** ctor takes `ApiAgentClient` + `IQueueProvider` — pass `makeMockAgentClient()` (its `generateEmbedding` returns a fixed 1536-vector) and `makeMockQueueProvider()`. `createOrReuse` runs the real pgvector `<=>` similarity query against `harness.db` (the harness image supports it). Preserve the 7 existing assertions against real rows; add coverage for the currently-untested `getCourse`/`getCourseWithModules`/`getUserCourses` read paths.

**Acceptance:** both files boot one shared container (90s timeout), exercise real SQL/Drizzle/pgvector/RLS-migrated schema, keep every prior behavioral assertion, and the only mocks are the LLM/agent (`fetch`/agent client) and the queue provider. Remove the "integration" misnomer doubt — these now hit a real DB.

- [ ] Rewrite chat test onto the harness; run green (all prior cases + DB cross-checks).
- [ ] Rewrite courses test onto the harness; run green (all prior cases + read-path additions).
- [ ] `pnpm --filter @autodidact/api test` green (all api suites); `typecheck` clean.
- [ ] Commit: `test(api): promote chat & courses integration tests to real Postgres`.

---

## Self-Review

**Spec coverage (Phase 1 items):** providers impls → T1; tracer → T2; db queries → T3; worker Redis + shutdown → T4; agent SSE + graph → T5; api chat/courses real-DB → T6. All Finding A/C/D/E items mapped. ✓
**Module-load side-effect handling:** every real-DB task specifies the `vi.mock('@autodidact/db')` getDb-redirect or env stubs. ✓
**Mock seam discipline:** LLM/agent mocked everywhere; real infra via harness; no stubbed-`fetch` except the one un-injectable `ChatService.streamMessage` path (documented). ✓
**No placeholders that hide work:** each task names exact files, signatures, harness calls, acceptance criteria, and verification commands; implementers write the concrete TDD test bodies. ✓
**Ordering:** independent packages, sequential to avoid lockfile/index conflicts; api (hardest) last. ✓
