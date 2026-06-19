# Subtree Instructions — services/api/

> These rules apply only within `services/api/`. They extend the root `CLAUDE.md`.

## Purpose of this subtree

`services/api` is the only public-facing HTTP service. It owns:
- JWT verification (via AuthGuard on every controller except /health)
- Course lifecycle: similarity check, enrollment, job enqueueing, status polling
- Chat session management and SSE proxying to the Agent service
- Message persistence (user and assistant messages to `chat_sessions`)
- Module progress tracking and sequential unlock logic

It does NOT run AI models. All AI logic lives in `services/agent`.

---

## Invariants (must not be broken)

- All controllers apply `@UseGuards(AuthGuard)` — the only unguarded route is `GET /health`
- No AI logic belongs in this service; AI calls go through `ApiAgentClient` to `services/agent`
- `QUEUE_PROVIDER_TOKEN` and `AUTH_PROVIDER_TOKEN` are injected via DI tokens — never import concrete provider classes directly from `@autodidact/providers`
- `ApiAgentClient` (`src/services/agent.client.ts`, provided once via `AgentModule`) is the component that calls the Agent service HTTP API — embeddings and the health probe (`isAgentHealthy()`). The single sanctioned exception is the SSE proxy in `chat.service.ts`, because the streaming bridge does not fit a request/response client method. Both `ApiAgentClient` and the chat proxy must attach `cloudRunAuthHeaders(...)` from `@autodidact/providers` (the agent is a private Cloud Run service). Do not call the agent from anywhere else; add new non-streaming calls as `ApiAgentClient` methods.
- All controller inputs are validated with `ZodValidationPipe` and schemas from `@autodidact/schemas`. Scope the pipe to the body parameter — `@Body(new ZodValidationPipe(Schema))` — **not** method-level `@UsePipes`: the pipe ignores parameter metadata, so a method-level pipe also runs the body schema against `@CurrentUser()` and rejects every request.
- The global prefix is `v1` (set in `main.ts`) — all routes are under `/v1/`

---

## Library / tooling rules

- Use:
  - NestJS (modules, guards, controllers, DI)
  - Drizzle ORM via `@autodidact/db` (never raw `pg` or direct `postgres` imports)
  - `@autodidact/schemas` for input/output validation schemas
  - `ZodValidationPipe` for all controller inputs
  - `@CurrentUser()` decorator to extract the authenticated `AuthUser` from the request
  - `@autodidact/observability` for logging (never `console.log`)
- Do not use:
  - Direct imports of concrete auth or queue provider classes
  - LLM SDKs (OpenAI, Anthropic, etc.)
  - Express APIs directly — NestJS wraps Express; do not bypass it

---

## Source of truth

- HTTP contract (routes, payloads): this service's controllers
- Auth user shape: `AuthUser` in `src/modules/auth/` (via `@autodidact/types`)
- Agent HTTP contract: `src/services/agent.client.ts`
- Queue job shapes: `src/queues/definitions.ts`

---

## Key patterns to follow

- **Module-per-feature**: each feature (`auth`, `courses`, `chat`, `progress`) is a NestJS module. Cross-module dependencies are explicit imports (e.g., `ChatModule` imports `ProgressModule`).
- **Provider token injection**: external dependencies (auth backend, queue) are injected using string tokens (`AUTH_PROVIDER_TOKEN`, `QUEUE_PROVIDER_TOKEN`) defined in `src/providers.token.ts`. Factories call `createAuthProvider()` / `createQueueProvider()` from `@autodidact/providers`.
- **Global provider modules**: both providers live in `@Global()` modules — `AuthModule` (`AUTH_PROVIDER_TOKEN` + `AuthGuard`) and `QueueModule` (`QUEUE_PROVIDER_TOKEN`). A provider declared inline in `AppModule` is **not** visible to the feature modules `AppModule` imports (exports flow to importers, not importees), so any token a feature module injects must come from a `@Global()` module. `AuthGuard` uses `@Inject(AUTH_PROVIDER_TOKEN)` on its constructor (the dependency is an interface, erased at runtime) so `@UseGuards(AuthGuard)` resolves in every module context.

---

## Anti-patterns to avoid

- Adding AI or LLM logic to any file in this service
- Calling the Agent service HTTP API from anywhere other than `ApiAgentClient`
- Bypassing `AuthGuard` on a new controller route
- Using `APP_GUARD` to register a global guard — the current pattern is `@UseGuards(AuthGuard)` per-controller
- Importing `IQueueProvider` implementation classes directly; always inject via `QUEUE_PROVIDER_TOKEN`
- Passing `logger: false` to `NestFactory.create` in `main.ts`. It silences Nest's `ExceptionHandler`, so a provider-factory boot failure surfaces as a misleading `RangeError: Maximum call stack size exceeded` and exits silently. Keep `logger: ['error', 'warn']` so real boot errors print; service code still logs via pino.

---

## Commands / workflows

```bash
# From monorepo root
pnpm dev                                    # start all services (requires build first)
pnpm --filter @autodidact/api dev           # api only (watches dist/main.js — build first)
pnpm --filter @autodidact/api build         # compile TypeScript to dist/
pnpm --filter @autodidact/api test          # run tests (vitest)
pnpm --filter @autodidact/api test:coverage # test with coverage report
pnpm --filter @autodidact/api typecheck     # type-check without emitting
```

---

## Testing rules

- Layers: unit/integration tests (instantiate services directly, real Postgres via `@autodidact/test-support`) live in `src/__tests__/*.test.ts`; the API-level e2e (`src/__tests__/e2e/app.e2e.test.ts`) boots the real `AppModule` over `@nestjs/testing` + `supertest` against a Testcontainers Postgres.
- The e2e mocks exactly two seams — auth (`overrideGuard(AuthGuard)` + `AUTH_PROVIDER`) and the LLM (`ApiAgentClient`); the queue is mocked via `QUEUE_PROVIDER_TOKEN`. DB is redirected with `vi.mock('@autodidact/db')` (`getDb`/`getPool` → harness). Everything else (routing, guards, filter, pipes, SQL) is real.
- `vitest.config.ts` uses **`unplugin-swc`** so TypeScript is transformed with `emitDecoratorMetadata`. NestJS reflected constructor injection needs it; vitest's default esbuild cannot emit decorator metadata and silently leaves constructor-injected providers `undefined`. It also resolves `@autodidact/providers` to its built **dist** to avoid pulling LLM SDK source into vite-node. Run `pnpm --filter @autodidact/api build` for sibling packages before the e2e if their dist is stale.

---

## Key Decisions

- [ADR-004 — REST API framework](../../docs/architecture/ADRs/services/api/ADR-004-rest-api-framework.md) (NestJS)
- [ADR-009 — External vendor abstraction](../../docs/architecture/ADRs/packages/providers/ADR-009-external-vendor-abstraction.md) (auth/queue providers consumed via NestJS DI)
- [ADR-011 — Real-time streaming transport](../../docs/architecture/ADRs/services/agent/ADR-011-realtime-streaming-transport.md) (SSE — API proxies the agent stream)
- [ADR-016 — Runtime schema validation](../../docs/architecture/ADRs/packages/schemas/ADR-016-runtime-schema-validation.md) (Zod via NestJS pipes)
- [ADR-020 — Authentication strategy](../../docs/architecture/ADRs/cross-cutting/ADR-020-authentication-strategy.md) (Supabase Auth — 🚩)
