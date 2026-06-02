# Test Overhaul — Phase 2: API-level E2E — Implementation Plan

> Execute via superpowers:subagent-driven-development. TDD. Single cohesive deliverable in `services/api`.

**Goal:** Boot the real NestJS app in-process via `@nestjs/testing` + `supertest` against a Testcontainers Postgres, with auth/queue/agent (LLM) mocked, and cover the HTTP edges ADR-024's API-level layer calls for: auth rejection (401), validation (400), the global exception-filter shape, health, and the courses/chat/progress journeys.

**Architecture:** One e2e harness builds the app once per file (`Test.createTestingModule({imports:[AppModule]})` with `.overrideProvider(...)`), `setGlobalPrefix('v1')`, `app.init()`, drive with `supertest(app.getHttpServer())`. DB via the `vi.mock('@autodidact/db')` redirect to `harness.db` (+ `getPool: () => harness.pool` for health). The model is mocked at the `ApiAgentClient`/`fetch` seam.

**Tech Stack:** NestJS, `@nestjs/testing`, `supertest` (all already devDeps), Testcontainers via `@autodidact/test-support`, Vitest (api config: forks/singleFork, Supabase env stubs, reflect-metadata setup).

---

## Cross-cutting facts (from recon — do not re-investigate)

- `main.ts` applies: `enableCors({origin:'*'})`, `setGlobalPrefix('v1')`, `initTracer` (no-op without OTEL). No global pipe/interceptor. The harness must replicate `setGlobalPrefix('v1')` after `createNestApplication()`.
- Global exception filter is `AllExceptionsFilter` via `{provide: APP_FILTER, useClass: AllExceptionsFilter}` in `AppModule` — already active when booting AppModule. Response shape: `{ statusCode, timestamp, path, error }` where `error` is the exception's `getResponse()` (object) or `'Internal server error'`.
- DI tokens (`src/providers.token.ts`): `AUTH_PROVIDER_TOKEN='AUTH_PROVIDER'`, `QUEUE_PROVIDER_TOKEN='QUEUE_PROVIDER'`. `ApiAgentClient` is provided by **class token** (override the class, not `AGENT_CLIENT_TOKEN` which is unused).
- Routes (all under `/v1`): `GET /health` (unguarded); `@UseGuards(AuthGuard)` on `courses`, `chat`, `progress`. `POST /courses` body = `CreateCourseRequestSchema` (`topic` 3–200, `difficulty?`, `moduleCount?` 3–20); `GET /courses`; `GET /courses/status/:jobId`; `GET /courses/:id`; `POST /courses/:id/enroll`; `POST /chat/sessions` (`{moduleId: UUID}`); `GET /chat/sessions/:id`; `@Sse GET /chat/sessions/:id/stream`; `GET /progress/:courseId`.
- `AuthGuard` injects `IAuthProvider` via `AUTH_PROVIDER_TOKEN`; `verifyToken(token)→AuthUser{ id, supabaseId, email, role? }`; writes `request.user`; 401 `'Missing authorization header'` / `'Invalid token'`.
- **The mock auth user's `id` must equal a seeded `users.id`** (controllers use `@CurrentUser().id` as the FK `courses.generatedBy` etc.). Seed a user, then have the mock `verifyToken` resolve an `AuthUser` whose `id` is that seeded id. Because `truncate()` runs per test, seed in `beforeEach` and have `verifyToken` read a mutable `currentUser` updated after each seed.
- `HealthController.check()` uses `getPool().query('SELECT 1')` (raw pool — NOT `getDb()`) and fetches `${AGENT_SERVICE_URL}/health`. Redirect `getPool` to `harness.pool` so db reports `ok`; the agent fetch will fail → assert `status` is `'ok'|'degraded'` and `services.db === 'ok'` (don't hard-require agent up), or stub `fetch` for the agent health probe.
- Module-load side effects: `@autodidact/db` builds Pool+Supabase client at import; the `vi.mock('@autodidact/db')` redirect (hoisted) handles the Pool, Supabase stubs already in `vitest.config.ts`. `QUEUE_PROVIDER` factory constructs IORedis at module init → MUST be overridden before `compile()` (overrideProvider runs before init — safe). Set `AGENT_SERVICE_URL` to a dummy in the test env.

---

### Task 1: API-level e2e harness + journeys

**Create:**
- `services/api/src/__tests__/e2e/app.e2e.test.ts` (or split into `auth.e2e.test.ts`, `courses.e2e.test.ts` if it grows >~300 lines — prefer splitting by concern once large).
- Optionally a small local helper `services/api/src/__tests__/e2e/harness.ts` exporting a `buildE2EApp()` that returns `{ app, request, harness, setCurrentUser }` to avoid duplication across files.

**Harness construction (in `beforeAll`):**
```
harness = await withTestDatabase()
// vi.mock('@autodidact/db', async () => ({ ...schema, getDb: () => harness.db, getPool: () => harness.pool, supabaseAdmin: null, ...drizzleHelpers }))
const authMock = { verifyToken: vi.fn(async () => currentUser) }  // currentUser is a mutable let
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(AUTH_PROVIDER_TOKEN).useValue(authMock)
  .overrideProvider(QUEUE_PROVIDER_TOKEN).useValue(makeMockQueueProvider())
  .overrideProvider(ApiAgentClient).useValue({ generateEmbedding: vi.fn(async () => Array(1536).fill(0.1)) })
  .compile()
app = moduleRef.createNestApplication()
app.setGlobalPrefix('v1')
await app.init()
request = supertest(app.getHttpServer())
```
`beforeEach`: `await harness.truncate()`; seed a user via `seedUser(harness.db)`; set `currentUser = { id: user.id, supabaseId: 'sb-'+user.id, email: 'e2e@test.com' }`. `afterAll`: `await app.close(); await harness.close()`. Set `process.env.AGENT_SERVICE_URL` to a dummy before imports.

**Acceptance — cover (real app, real DB, mocked auth/queue/agent):**
1. **Auth rejection:** `GET /v1/courses` with NO `Authorization` → 401; body matches the filter shape (`statusCode:401`, `error` object with `'Missing authorization header'`). With `Authorization: Bearer anytoken` → 200 (mock verifies).
2. **Validation:** `POST /v1/courses` + auth + invalid body (`{topic:'ab'}`, too short) → 400; `body.error.message === 'Validation failed'` and `body.error.errors` is a non-empty array with `path`/`message`.
3. **Health:** `GET /v1/health` (no auth) → 200; `body.services.db === 'ok'` (getPool redirected). Tolerate agent `'error'`/overall `'degraded'`.
4. **Courses journey:** `POST /v1/courses` valid body → 200/201 with a `courseId` (mock agent embedding + mock queue enqueue called); `GET /v1/courses/:id` → 200 returns the course; `POST /v1/courses/:id/enroll` → 200/201 and a real `module_progress`/`enrollments` row appears (assert via `harness.db`); `GET /v1/courses` → 200 list includes the course; `GET /v1/progress/:courseId` → 200. (Seed modules on the created course as needed via `seedModules` so enroll has rows.)
5. **Exception-filter shape:** trigger a 404 (`GET /v1/courses/<nonexistent-uuid>`) or a service error and assert the wrapped `{statusCode,timestamp,path,error}` envelope.
6. **Chat session:** `POST /v1/chat/sessions` with a valid `moduleId` (seed a module first) + auth → 200/201 returns a session; `GET /v1/chat/sessions/:id` → 200. (Skip the `@Sse` stream endpoint here — SSE through supertest is covered conceptually by Phase 1's agent route + the chat service test; if feasible, assert the stream endpoint sets `Content-Type: text/event-stream`, else omit.)

Keep assertions on real DB effects where a write occurs (enroll, create) — not just status codes.

- [ ] Write the harness + failing e2e tests.
- [ ] Run `pnpm --filter @autodidact/api test -- e2e` → green. Then full `pnpm --filter @autodidact/api test` → all suites green (existing 50 + new e2e).
- [ ] `pnpm --filter @autodidact/api typecheck` clean.
- [ ] Commit: `test(api): add API-level e2e harness and HTTP-edge journeys`.

---

## Self-Review
- ADR-024 API-level layer (real app + supertest + real PG, mocked model): satisfied by Task 1. ✓
- Auth-reject / validation / exception-filter / health / journeys all covered. ✓
- Mock seam discipline: only auth, queue, and the agent/embedding are mocked; app, routing, guards, filter, DB are real. ✓
- The mutable-`currentUser` pattern keeps the seeded FK user aligned with the authenticated principal across `truncate()`. ✓
