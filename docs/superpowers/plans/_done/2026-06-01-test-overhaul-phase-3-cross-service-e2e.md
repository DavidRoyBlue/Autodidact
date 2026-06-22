# Test Overhaul — Phase 3: Cross-service E2E — Implementation Plan

> Execute via superpowers:subagent-driven-development. TDD where it pays. Two deliverables: a **mock provider pair** in `@autodidact/providers`, and a new **`e2e/` workspace package** that boots the real api + agent + worker against Testcontainers Postgres/Redis and drives one golden-path journey with the LLM mocked.

**Goal (ADR-026 cross-service layer):** run the *real* three services together — provider-swapped to a mock LLM/embedding (`LLM_PROVIDER=mock`, `EMBEDDING_PROVIDER=mock`) — and verify the golden path end to end: create course → worker generates it (mock LLM) → enroll → chat turn (SSE) → module completes → next module unlocks. Plus a failure path (auth rejection).

**Architecture:** Single mock seam = the model. Everything else real: real HTTP between api↔agent, real BullMQ worker over real Redis, real Postgres, real LangGraph graphs, real SSE. Services run as **child processes** (`node dist/main.js`) — there are no per-service Dockerfiles. Postgres+Redis via `@autodidact/test-support` containers.

---

## Cross-cutting facts (from recon — do not re-investigate)

- **Provider factory** (`packages/providers/src/factory.ts`): `createLLMProvider` honors `LLM_PROVIDER` (`openai`|`anthropic` only today); `createEmbeddingProvider` currently **ignores** `EMBEDDING_PROVIDER` and always returns OpenAI. Both must learn a `mock` branch.
- **ILLMProvider**: `getModel(): BaseChatModel`, `getModelName(): string`. **IEmbeddingProvider**: `embed(text)`, `embedBatch(texts)`, `getEmbeddings(): Embeddings`.
- **Graphs invoke `model.invoke(messages)`** (not stream) inside nodes; the agent route uses `graph.stream(state,{streamMode:'messages'})` to surface tokens. A `SimpleChatModel` whose `_call` returns the whole string streams as one chunk — fine for the e2e.
- **Mock model branches on the system prompt** (stable substrings, no coupling to `@autodidact/prompts`):
  - contains `"curriculum designer"` → return a valid `CourseBlueprintSchema` JSON (≥3 modules so unlock is observable).
  - contains `"assessment AI"` / `"evaluate whether"` → return `{"completed":true,"score":85,"feedback":"..."}`.
  - else (teacher) → return a short teaching reply ending with `[MODULE_COMPLETE:score=85]` so one turn completes the module.
- **CourseBlueprintSchema**: `{title, description, difficulty('beginner'|'intermediate'|'advanced'), estimatedHours>0, modules[≥1]{position≥0, title, description, objectives[≥1], contentOutline[]{title,points[]}, estimatedMinutes>0}}`. Module `id` optional (worker/agent fills).
- **Course-gen flow**: api `POST /v1/courses` → enqueue BullMQ `course-generation`/`generate-course` `{courseId,userId,topic,difficulty,moduleCount}` → worker `course-generation.processor.ts` sets `generating`, calls agent `POST /course/generate`, then txn writes course `ready` + inserts `modules`, then enqueues an embedding job.
- **Chat flow**: api `POST /v1/chat/sessions` then the SSE message stream → api proxies agent `POST /module-chat/stream` (SSE) → on `complete` with score≥60 api calls `ProgressService.completeModule` → marks module `completed`, unlocks next (`position+1`, `locked`→`available`), sets `enrollments.completedAt` when all done.
- **Service entries/ports/env**:
  - api `services/api/src/main.ts` — `API_PORT`(3000); needs `DATABASE_URL,REDIS_URL,AGENT_SERVICE_URL`, plus Supabase env for `createAuthProvider` (use the same stubs the api vitest uses).
  - agent `services/agent/src/main.ts` — `AGENT_PORT`(3001); needs `LLM_PROVIDER,EMBEDDING_PROVIDER,CHECKPOINTER`(=`memory`).
  - worker `services/worker/src/main.ts` — no port; needs `REDIS_URL,AGENT_SERVICE_URL,DATABASE_URL`.
- **Auth in cross-service**: api uses the real `AuthGuard` → real `SupabaseAuthProvider.verifyToken`. We can't mint real Supabase JWTs. Options (decide in Task 3): (a) add a `mock` auth provider branch (`AUTH_PROVIDER=mock`) that decodes a test token to a seeded user id — cleanest and mirrors the LLM seam; (b) seed a user and stub. **Plan: add a `mock` auth provider** (`AUTH_PROVIDER=mock`) accepting `Bearer test-<userId>` → `{id:<userId>,...}`. This is the single auth seam for cross-service + keeps services real otherwise.
- **Turbo**: `build` depends on `^build`; a `test:e2e` pipeline exists (`dependsOn: ^build, test`). Workspace globs: `apps/*`, `services/*`, `packages/*` → add `e2e` via `e2e/*` or rename glob.

---

### Task 1: Mock LLM + embedding providers (`@autodidact/providers`)

**Create:**
- `src/implementations/llm/mock.provider.ts` — `MockLLMProvider implements ILLMProvider`. `getModel()` returns a `MockChatModel extends SimpleChatModel` (`@langchain/core/language_models/chat_models`) with `_llmType()='mock'` and `_call(messages)` branching as above. Deterministic, no network.
- `src/implementations/embedding/mock-embedding.provider.ts` — `MockEmbeddingProvider implements IEmbeddingProvider`. `embed`→ fixed 1536-dim vector (e.g. normalized hash of text or all-0.1); `embedBatch`→ map; `getEmbeddings()`→ a `FakeEmbeddings`-style object (or LangChain `FakeEmbeddings` from `@langchain/core/utils/testing`).
- Optional `src/implementations/auth/mock-auth.provider.ts` — `MockAuthProvider implements IAuthProvider`. `verifyToken('test-<uuid>')` → `{id:<uuid>, supabaseId:'sb-'+<uuid>, email:'e2e@test.com'}`; throws on anything else.

**Edit `factory.ts`:** add `if (provider==='mock')` to `createLLMProvider`; make `createEmbeddingProvider` read `EMBEDDING_PROVIDER` and branch `mock`; add `mock` to `createAuthProvider` (`AUTH_PROVIDER`).

**Tests (`src/__tests__/`):** unit-test each mock: blueprint JSON parses + passes `CourseBlueprintSchema`; teacher reply contains the completion marker; evaluator returns valid JSON; embedding returns 1536 dims; factory returns the mock impls when env=`mock`. Use the providers `vitest.config.ts` (already has the js-to-ts plugin).

- [ ] Write failing unit tests → implement → green: `pnpm --filter @autodidact/providers test`, `typecheck`.
- [ ] Commit: `feat(providers): add mock LLM/embedding/auth providers for e2e`.

### Task 2: `e2e/` workspace package scaffold

**Create:** `e2e/package.json` (`@autodidact/e2e`, private, devDeps: test-support, types, schemas, db, supertest, eventsource/undici for SSE, vitest, typescript), `tsconfig.json`, `tsconfig.build.json` (or none), `vitest.config.ts` (long timeouts ~120s, singleFork, no coverage threshold yet), `README.md`, `CLAUDE.md`. Update root `pnpm-workspace.yaml` (add `e2e` glob) and confirm `turbo.json test:e2e`.

- [ ] `pnpm install` resolves the new package; `pnpm --filter @autodidact/e2e typecheck` clean (empty/placeholder ok).
- [ ] Commit: `chore(e2e): scaffold cross-service e2e workspace package`.

### Task 3: Service orchestration harness (`e2e/src/harness.ts`)

Boot order and lifecycle:
1. `withTestDatabase()` + `withTestRedis()` (test-support).
2. Resolve free ports for api/agent. Build env: `DATABASE_URL`=container, `REDIS_URL`=container, `AGENT_SERVICE_URL`=`http://localhost:<agentPort>`, `LLM_PROVIDER=mock`, `EMBEDDING_PROVIDER=mock`, `CHECKPOINTER=memory`, `AUTH_PROVIDER=mock`, Supabase stubs, `API_PORT`/`AGENT_PORT`.
3. Spawn `node services/agent/dist/main.js`, then worker, then api (api health probes agent). Capture stdout/stderr to buffers for diagnostics.
4. `waitForHttp(url, predicate, timeout)` on agent `/health` and api `/v1/health` until `ok`/`degraded`.
5. Return `{ apiUrl, agentUrl, db, pool, truncate, stop() }`. `stop()` kills children (SIGTERM, await exit), closes containers.

Assumes services are pre-built (`pnpm build`). Harness throws a clear error if a `dist/main.js` is missing (instruct to build).

- [ ] A smoke test (`harness.test.ts`) that boots the harness, asserts both health endpoints, tears down. Green.

### Task 4: Golden-path journey (`e2e/src/__tests__/golden-path.e2e.test.ts`)

Using `supertest(apiUrl)` (or undici) with `Authorization: Bearer test-<seededUserId>`:
1. Seed a user row (so FK + mock-auth id line up) via `seedUser(harness.db)`; token = `test-${user.id}`.
2. `POST /v1/courses {topic,difficulty,moduleCount:3}` → 200/201 `{courseId}`.
3. Poll `GET /v1/courses/status/:jobId` (or the course row via `harness.db`) until `status='ready'` (worker + mock agent; should be fast). Assert `modules` rows ≥3 exist.
4. `POST /v1/courses/:id/enroll` → module_progress rows created (pos0 `available`, rest `locked`).
5. Create chat session `POST /v1/chat/sessions {moduleId:<pos0>}`; drive the SSE message endpoint with a user message; collect events; assert a `complete` event and that the assistant streamed.
6. Assert module pos0 `completed` and pos1 flipped `locked`→`available` (via `harness.db` and/or `GET /v1/progress/:courseId`).
7. **Failure path:** a request with a bad/missing token → 401 envelope.

Keep assertions on real DB state for each transition.

- [ ] `pnpm build` then `pnpm --filter @autodidact/e2e test` green; `typecheck` clean.
- [ ] Commit: `test(e2e): cross-service golden-path journey with mock LLM`.

### Task 5: Wire-up & docs

- Root `package.json`: a `test:e2e` script (e.g. `turbo run test:e2e` or `pnpm --filter @autodidact/e2e test`) if not present; ensure it builds first.
- `e2e/CLAUDE.md` + `README.md`: how the harness works, the single mock seam, how to run, the build-first requirement.
- Cross-link from `docs/architecture/ADRs/.../ADR-026` (e2e strategy) if it references the layers.

- [ ] Commit: `chore(e2e): wire test:e2e pipeline and document harness`.

---

## Self-Review
- ADR-026 cross-service layer (real 3 services + real PG/Redis + mock model): Tasks 1–4. ✓
- Single mock seam = model (+ a mock auth seam because we can't mint Supabase JWTs; everything else real). ✓
- Golden path covers generate → enroll → chat → complete → unlock with real DB assertions; plus an auth failure path. ✓
- Mock model is deterministic and decoupled (branches on stable prompt substrings). ✓
- Services pre-built; harness fails loud if dist missing. ✓
