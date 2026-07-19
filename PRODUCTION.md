# Production Map

> One section per deployable/package: what it is, what it runs on, where its secrets live.
> Status: 🟢 deployed · 🔵 ready · 🟡 deployed but buggy · 🔴 in build
> Bump `_verified:` when you re-check a section. Sections older than 30 days are flagged weekly by [production-doc-freshness.yml](.github/workflows/production-doc-freshness.yml).
> Imperative rules live in `CLAUDE.md` files; architecture and decisions in [docs/](docs/README.md).

## Mobile 🟢
_verified: 2026-07-19_

Expo React Native app — the only client; talks exclusively to the API service.

**Agent surface**
- MCP: mobile-mcp, supabase
- Skills: run-mobile
- Hooks: none
- Agents: none

**Stack**
- Framework: Expo SDK 52 + Expo Router 4, React Native 0.76
- UI: NativeWind v4 + React Native Reusables (tokens = CSS variables in global.css)
- State: TanStack Query 5 (server) / Zustand 5 (client)
- Auth: Supabase (email/password, anonymous guest, Google native id-token, Facebook PKCE)
- Streaming: SSE via @microsoft/fetch-event-source
- Testing: Jest (jest-expo) unit/component; Maestro e2e (manual/nightly, not PR-gated)
- Build: EAS — development (dev client → local), preview (APK → prod API), production (Play AAB → prod API)

**Secrets**
- prod: [eas.json](apps/mobile/eas.json) profile env (publishable values only) + `app.config.ts` injection
- dev: [.env.example](.env.example) → `.env.dev` (self-loaded by `app.config.ts`)

**State** — Set for prod and dev; social sign-in requires the custom dev build (not Expo Go).
- dev run: [scripts/run-mobile.sh](scripts/run-mobile.sh) (`pnpm mobile:run`) — opens the dev client; device reaches host via `10.0.2.2`
- dev client: EAS `development` build green + installed on the `Medium_Phone` AVD (2026-07-19); `preview` profile green
- prod build: `eas build --profile production --platform android` ([eas.json](apps/mobile/eas.json))

**Useful Files**
- [app.config.ts](apps/mobile/app.config.ts)
- [global.css](apps/mobile/src/global.css)
- [social-auth.ts](apps/mobile/src/lib/social-auth.ts)
- [android-emulator-wsl2.md](apps/mobile/docs/android-emulator-wsl2.md)
- [docs/](apps/mobile/docs/)

## API 🟢
_verified: 2026-07-19_

NestJS public HTTP service (port 3000, prefix `/v1`) — auth boundary, course lifecycle, chat SSE proxy, progress. Runs no AI.

**Agent surface**
- MCP: supabase, gcloud
- Skills: none
- Hooks: none
- Agents: none

**Stack**
- Framework: NestJS
- Auth: Supabase JWT via JWKS (RS256), `AuthGuard` on every controller except `/health`
- DB: Drizzle via `@autodidact/db`
- Queue: Cloud Tasks (prod) / loopback HTTP (dev)
- Validation: Zod pipes from `@autodidact/schemas`
- Testing: Vitest — unit/integration (Testcontainers Postgres) + e2e boot of AppModule

**Secrets**
- prod: GCP Secret Manager (seeded from `infra/secrets.env`)
- dev: [.env.example](.env.example) → `.env.dev`

**State** — Live on Cloud Run (public, 1–10 instances); deploys on `master` → `production` promotion.
- deploy: [deploy.yml](.github/workflows/deploy.yml)

**Useful Files**
- [controllers (HTTP contract)](services/api/src/modules/)
- [agent.client.ts](services/api/src/services/agent.client.ts)
- [main.ts](services/api/src/main.ts)

## Agent 🟢
_verified: 2026-07-19_

Fastify + LangGraph internal AI runtime (port 3001, never public) — all LLM and embedding calls.

**Agent surface**
- MCP: supabase, gcloud
- Skills: none
- Hooks: none
- Agents: none

**Stack**
- Framework: Fastify + LangGraph (course-generation + module-chat graphs)
- LLM: OpenAI (default) / Anthropic via `LLM_PROVIDER`
- Embeddings: OpenAI text-embedding-3-small (1536-dim)
- Checkpointer: postgres (prod) / memory (dev) via `CHECKPOINTER`
- RAG: pgvector `module_content_chunks` retrieval, gated by `RAG_ENABLED`
- Resilience: `invokeModel()` — per-attempt timeout, bounded retry, abort propagation
- Testing: Vitest (nodes, graphs, routes, RAG, resilience)

**Secrets**
- prod: GCP Secret Manager (seeded from `infra/secrets.env`)
- dev: [.env.example](.env.example) → `.env.dev`

**State** — Live on Cloud Run (internal-only ingress, 1–5 instances); deploys on `master` → `production` promotion.
- deploy: [deploy.yml](.github/workflows/deploy.yml)

**Useful Files**
- [routes (SSE protocol)](services/agent/src/routes/)
- [graphs](services/agent/src/graphs/)
- [resilient-invoke.ts](services/agent/src/llm/resilient-invoke.ts)
- [retriever.ts](services/agent/src/rag/retriever.ts)

## Worker 🟢
_verified: 2026-07-19_

Fastify background task handler invoked per-task by Cloud Tasks (prod) / loopback (dev); scale-to-zero.

**Agent surface**
- MCP: supabase, gcloud
- Skills: none
- Hooks: none
- Agents: none

**Stack**
- Framework: Fastify (`/tasks/:name` + `/health` only)
- Tasks: generate-course, generate-embedding, cleanup-stale-anonymous
- DB: Drizzle via `@autodidact/db`; raw SQL for `::vector` writes
- Retry: queue-level (Terraform `retry_config`, 3 attempts); `TASK_MAX_ATTEMPTS` mirrors it; final failure marks course `failed`
- Auth: none in-app — Cloud Run IAM verifies Cloud Tasks OIDC
- Testing: Vitest — unit processors + integration against real Postgres

**Secrets**
- prod: GCP Secret Manager (seeded from `infra/secrets.env`)
- dev: [.env.example](.env.example) → `.env.dev`

**State** — Live on Cloud Run (internal, 0–3 instances); deploys on `master` → `production` promotion.
- deploy: [deploy.yml](.github/workflows/deploy.yml)

**Useful Files**
- [app.ts (task contract)](services/worker/src/app.ts)
- [processors](services/worker/src/processors/)
- [agent.client.ts](services/worker/src/services/agent.client.ts)

## Infra 🟢
_verified: 2026-07-19_

Terraform IaC for the GCP production environment (project `autodidact-494819`, region `northamerica-northeast1`).

**Agent surface**
- MCP: gcloud
- Skills: none
- Hooks: none
- Agents: none

**Stack**
- IaC: Terraform ≥ 1.9, GCP provider ~> 5.0, remote state in GCS (`autodidact-terraform-state`)
- Compute: Cloud Run ×3 (api public 1–10, agent internal 1–5, worker internal 0–3)
- Queues: Cloud Tasks (course-generation, embedding)
- Images: Artifact Registry
- CI/CD: GitHub Actions — PRs validated by ci.yml; deploy on `master` → `production` promotion (WIF, no key files)

**Secrets**
- prod: `infra/secrets.env` (gitignored, single source) → Secret Manager via [gcp-bootstrap.sh](scripts/gcp-bootstrap.sh)
- dev: none

**State** — Live; apply from `infra/environments/prod` after `terraform plan`.
- runbook: [docs/gcp_infra_setup.md](docs/gcp_infra_setup.md)

**Useful Files**
- [main.tf](infra/environments/prod/main.tf)
- [modules/](infra/modules/)
- [deploy.yml](.github/workflows/deploy.yml)

## packages/db 🟢
_verified: 2026-07-19_

Drizzle client, schema, and migrations — single source of truth for DB structure (Supabase Postgres + pgvector).

**Agent surface**
- MCP: supabase
- Skills: none
- Hooks: none
- Agents: none

**Stack**
- ORM: Drizzle + `pg` Pool; custom 1536-dim `vector` column type
- Migrations: Drizzle only (never `supabase migration`)
- Security: RLS migrations; Supabase admin client (`SUPABASE_SECRET_KEY`)

**Secrets**
- prod: `infra/secrets.env` (used by `migrate:prod` / `db:studio:prod`)
- dev: [.env.example](.env.example) → `.env.dev` (local stack DB `127.0.0.1:55322`)

**State** — Schema, migrations, and pgvector verified in prod and dev.

**Useful Files**
- [schema/](packages/db/src/schema/)
- [migrations/](packages/db/migrations/)
- [client.ts](packages/db/src/client.ts)

## packages/providers 🟢
_verified: 2026-07-19_

Vendor abstraction — interfaces + factories for LLM, embedding, queue, auth, and checkpointer providers.

**Agent surface**
- MCP: none
- Skills: none
- Hooks: none
- Agents: none

**Stack**
- LLM: LangChain ChatOpenAI / ChatAnthropic
- Queue: GCP Cloud Tasks / loopback HTTP
- Auth: Supabase JWKS JWT verification
- Switches wired: `LLM_PROVIDER`, `QUEUE_PROVIDER`, `CHECKPOINTER`; `EMBEDDING_PROVIDER`/`AUTH_PROVIDER` reserved (single impl hardcoded); `mock` providers are e2e-only

**Secrets**
- prod: GCP Secret Manager (via consuming services)
- dev: [.env.example](.env.example) → `.env.dev`

**State** — All wired providers exercised in prod; Cohere embedding provider is a stub.

**Useful Files**
- [factory.ts](packages/providers/src/factory.ts)
- [interfaces/](packages/providers/src/interfaces/)
- [implementations/](packages/providers/src/implementations/)

## packages/env 🟢
_verified: 2026-07-19_

Typed fail-fast Zod env validation, called once per service at boot (in `main.ts`, never at import time).

**Agent surface**
- MCP: none
- Skills: none
- Hooks: none
- Agents: none

**Stack**
- Validation: Zod (`loadApiEnv` / `loadAgentEnv` / `loadWorkerEnv`)

**Secrets**
- prod: GCP Secret Manager (validated at boot)
- dev: [.env.example](.env.example) → `.env.dev`

**State** — In prod via all three services.

**Useful Files**
- [src/](packages/env/src/)

## packages/schemas 🟢
_verified: 2026-07-19_

Zod schemas validating API request bodies and LLM output at service boundaries.

**Agent surface**
- MCP: none
- Skills: none
- Hooks: none
- Agents: none

**Stack**
- Validation: Zod; consumed via NestJS `ZodValidationPipe` and agent `safeParse`

**Secrets**
- prod: none
- dev: none

**State** — In prod via all three services.

**Useful Files**
- [src/](packages/schemas/src/)

## packages/prompts 🟢
_verified: 2026-07-19_

Centralized system prompts and prompt builders for all LLM interactions (agent-only consumer).

**Agent surface**
- MCP: none
- Skills: none
- Hooks: none
- Agents: none

**Stack**
- Plain TS prompt builders; blueprint JSON schema embedded in prompts must mirror `CourseBlueprintSchema`
- Completion marker `[MODULE_COMPLETE:score=N]` — regex lives in agent `module-chat/nodes.ts`; pass threshold (60) in API `ChatService`

**Secrets**
- prod: none
- dev: none

**State** — In prod via the agent service.

**Useful Files**
- [course-generation.ts](packages/prompts/src/course-generation.ts)
- [module-teacher.ts](packages/prompts/src/module-teacher.ts)
- [completion-evaluator.ts](packages/prompts/src/completion-evaluator.ts)

## packages/types 🟢
_verified: 2026-07-19_

Pure compile-time domain types — no runtime code; Zod belongs in `packages/schemas`.

**Agent surface**
- MCP: none
- Skills: none
- Hooks: none
- Agents: none

**Stack**
- TS types/unions only

**Secrets**
- prod: none
- dev: none

**State** — In prod via all consumers.

**Useful Files**
- [src/](packages/types/src/)

## packages/observability 🟢
_verified: 2026-07-19_

Structured logging (pino) + opt-in OpenTelemetry tracing for all services.

**Agent surface**
- MCP: none
- Skills: none
- Hooks: none
- Agents: none

**Stack**
- Logging: pino (JSON in prod, pino-pretty otherwise)
- Tracing: OTEL — no-op unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set (currently unset; traces dropped)

**Secrets**
- prod: none
- dev: none

**State** — Logging live in prod; trace export not yet wired to a collector.

**Useful Files**
- [logger.ts](packages/observability/src/logger.ts)
- [tracer.ts](packages/observability/src/tracer.ts)

## packages/config 🔵
_verified: 2026-07-19_

Shared tooling config (tsconfig, ESLint, Prettier, Vitest bases) + canonical provider mock factories. Dev-only, never deployed.

**Agent surface**
- MCP: none
- Skills: none
- Hooks: none
- Agents: none

**Stack**
- Node base tsconfig: `NodeNext` (relative imports need `.js`); RN base: `bundler` resolution — never for Node services
- Test mocks: `src/test-utils/mock-factories.ts`

**Secrets**
- prod: none
- dev: none

**State** — Stable dev tooling.

**Useful Files**
- [tsconfig.base.json](packages/config/tsconfig.base.json)
- [vitest.base.ts](packages/config/vitest.base.ts)
- [mock-factories.ts](packages/config/src/test-utils/mock-factories.ts)

## packages/test-support 🔵
_verified: 2026-07-19_

Testcontainers harness providing a real pgvector Postgres for integration tests (real infra only — mocks live in `packages/config`).

**Agent surface**
- MCP: none
- Skills: none
- Hooks: none
- Agents: none

**Stack**
- Testcontainers `pgvector/pgvector:pg16`; applies dev-db init SQL + all migrations
- Harness: `withTestDatabase()` + seed builders

**Secrets**
- prod: none
- dev: none

**State** — Stable test infra.

**Useful Files**
- [src/](packages/test-support/src/)
