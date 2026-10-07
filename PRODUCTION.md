# Production Map

> One section per deployable/package: what it is, what it runs on, where its secrets live.
> Status: 🟢 deployed · 🔵 ready · 🟡 deployed but buggy · 🔴 in build
> Bump `_verified:` when you re-check a section. Sections older than 30 days are flagged weekly by [production-doc-freshness.yml](.github/workflows/production-doc-freshness.yml).
> Imperative rules live in `AGENTS.md` files; architecture and decisions in [docs/](docs/README.md).

## Mobile 🟢
_verified: 2026-10-07_

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
- Streaming: SSE body read whole via `apiFetch` after the API closes it (`src/hooks/useSSE.ts`; RN fetch cannot stream)
- Testing: Jest (jest-expo) unit/component; Maestro e2e (manual/nightly, not PR-gated)
- Build: local WSL gradle via `scripts/run-mobile.sh` for the phone or the emulator; EAS — preview (APK → prod API), production (Play AAB → prod API) for distribution

**Secrets**
- prod: [eas.json](apps/mobile/eas.json) profile env (publishable values only) + `app.config.ts` injection
- dev: [.env.example](.env.example) → `.env.dev` (self-loaded by `app.config.ts`)

**State** — Set for prod and dev; runs only as a full APK (not Expo Go).
- dev run: [scripts/run-mobile.sh](scripts/run-mobile.sh) (`pnpm mobile:run`; debug APK on Metro = Fast Refresh, `--release` = bundled) — builds the dev variant `com.autodidact.app.dev` (beside the store app) in WSL, installs it on the plugged-in phone (reaches host via the PC's LAN address) or the `Medium_Phone` AVD (via `10.0.2.2`). Walked through 2026-09-29 ([walkthrough](apps/mobile/docs/walkthrough-2026-09-29.md))
- EAS: `development`/`preview` builds green 2026-07-19 (cloud dev client no longer the dev path)
- prod build: `eas build --profile production --platform android` ([eas.json](apps/mobile/eas.json))

**Useful Files**
- [app.config.ts](apps/mobile/app.config.ts)
- [global.css](apps/mobile/src/global.css)
- [social-auth.ts](apps/mobile/src/lib/social-auth.ts)
- [android-emulator-wsl2.md](apps/mobile/docs/android-emulator-wsl2.md)
- [docs/](apps/mobile/docs/)

## API 🟢
_verified: 2026-09-30_

NestJS public HTTP service (port 3000, prefix `/v1`) — auth boundary, course lifecycle, chat streaming to the client, progress. Runs no AI itself; the module teacher is a run on AgentPlatform's `course-teacher` agent, one per learner turn on a thread per session (ADR-031).

**Agent surface**
- MCP: supabase, gcloud
- Skills: none
- Hooks: none
- Agents: none

**Stack**
- Framework: NestJS
- Auth: Supabase JWT via JWKS (RS256), `AuthGuard` on every controller except `/v1/health`
- DB: Drizzle via `@autodidact/db`
- Queue: Cloud Tasks (prod) / loopback HTTP (dev)
- Validation: Zod pipes from `@autodidact/schemas`
- Testing: Vitest — unit/integration (Testcontainers Postgres) + e2e boot of AppModule
- AgentPlatform: `AGENT_PLATFORM_URL`, bearer `AGENT_PLATFORM_API_KEY` as actor `autodidact-api`; fails closed when unreachable (ADR-032)

**Secrets**
- prod: GCP Secret Manager (seeded from `infra/secrets.env`); platform key `autodidact-api-agent-platform-key`
- dev: [.env.example](.env.example) → `.env.dev`

**State** — Stale on Cloud Run (public, 0–10 instances, scale-to-zero): last deploy 2026-06-26; redeploy per [§9](docs/gcp_infra_setup.md#9-redeploy-after-a-pause--the-2026-10-catch-up-deploy-320). The module teacher cannot run in prod until it can reach AgentPlatform (#321). Deploys on `app-release promote` (`master` → `prod`).
- deploy: [deploy.yml](.github/workflows/deploy.yml)

**Useful Files**
- [controllers (HTTP contract)](services/api/src/modules/)
- [agent.client.ts](services/api/src/services/agent.client.ts)
- [agent-platform.client.ts](services/api/src/services/agent-platform.client.ts)
- [main.ts](services/api/src/main.ts)

## Agent 🟢
_verified: 2026-09-30_

Fastify internal embeddings runtime (port 3001, never public). Course generation and module teaching run on AgentPlatform instead (ADR-030, ADR-031) — no LangGraph, no LLM chat call, no checkpointer left in this service.

**Agent surface**
- MCP: supabase, gcloud
- Skills: none
- Hooks: none
- Agents: none

**Stack**
- Framework: Fastify
- Embeddings: OpenAI text-embedding-3-small (1536-dim)
- Testing: Vitest (routes, health)

**Secrets**
- prod: GCP Secret Manager (seeded from `infra/secrets.env`)
- dev: [.env.example](.env.example) → `.env.dev`

**State** — Stale on Cloud Run (ingress `all`, invoker IAM = runtime SA only; 0–5 instances, scale-to-zero): last deploy 2026-06-26; redeploy per [§9](docs/gcp_infra_setup.md#9-redeploy-after-a-pause--the-2026-10-catch-up-deploy-320). Deploys on `app-release promote` (`master` → `prod`).
- deploy: [deploy.yml](.github/workflows/deploy.yml)

**Useful Files**
- [routes](services/agent/src/routes/)
- [main.ts](services/agent/src/main.ts)

## Worker 🟢
_verified: 2026-09-30_

Fastify background task handler invoked per-task by Cloud Tasks (prod) / loopback (dev); scale-to-zero.

**Agent surface**
- MCP: supabase, gcloud
- Skills: none
- Hooks: none
- Agents: none

**Stack**
- Framework: Fastify (`/tasks/:name` + `/health` only)
- Tasks: generate-course (a run on AgentPlatform's `course-creator-lean` workflow, ADR-030; bearer `AGENT_PLATFORM_API_KEY` as actor `autodidact-worker`, run cancelled at the worker's timeout, ADR-032), generate-embedding, cleanup-stale-anonymous
- DB: Drizzle via `@autodidact/db`; raw SQL for `::vector` writes
- Retry: queue-level (Terraform `retry_config`, 3 attempts); `TASK_MAX_ATTEMPTS` mirrors it; final failure marks course `failed`
- Auth: none in-app — Cloud Run IAM verifies Cloud Tasks OIDC
- Testing: Vitest — unit processors + integration against real Postgres

**Secrets**
- prod: GCP Secret Manager (seeded from `infra/secrets.env`); platform key `autodidact-worker-agent-platform-key`
- dev: [.env.example](.env.example) → `.env.dev`

**State** — Stale on Cloud Run (ingress `all`, invoker IAM = runtime SA only; 0–3 instances): last deploy 2026-06-26; redeploy per [§9](docs/gcp_infra_setup.md#9-redeploy-after-a-pause--the-2026-10-catch-up-deploy-320). generate-course cannot run in prod until it can reach AgentPlatform (#321). Deploys on `app-release promote` (`master` → `prod`).
- deploy: [deploy.yml](.github/workflows/deploy.yml)

**Useful Files**
- [app.ts (task contract)](services/worker/src/app.ts)
- [processors](services/worker/src/processors/)
- [agent.client.ts](services/worker/src/services/agent.client.ts)
- [agent-platform.client.ts](services/worker/src/services/agent-platform.client.ts)

## Infra 🟢
_verified: 2026-09-30_

Terraform IaC for the GCP production environment (project `autodidact-494819`, region `northamerica-northeast1`).

**Agent surface**
- MCP: gcloud
- Skills: none
- Hooks: none
- Agents: none

**Stack**
- IaC: Terraform ≥ 1.9, GCP provider ~> 5.0, remote state in GCS (`autodidact-terraform-state`)
- Compute: Cloud Run ×3 (api public 0–10, agent 0–5 and worker 0–3 IAM-invoker-only; all scale-to-zero)
- Queues: Cloud Tasks (course-generation, embedding)
- Images: Artifact Registry
- CI/CD: GitHub Actions — PRs validated by ci.yml; deploy on `app-release promote` (`master` → `prod`; WIF, no key files)
- AgentPlatform: hosted on GCP by `~/AgentPlatform`, not by this Terraform (ADR-032); not deployed yet — `autodidact-agent-platform-url` holds a placeholder

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
_verified: 2026-09-30_

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

**State** — Schema, migrations, and pgvector verified in dev (local stack re-migrated 2026-09-28, all 15 migrations applied). Prod is at migration `0010`; `0011`–`0015` are pending there, applied by the [§9](docs/gcp_infra_setup.md#9-redeploy-after-a-pause--the-2026-10-catch-up-deploy-320) catch-up deploy. Prod Supabase restored (Pro) 2026-09-29.

**Useful Files**
- [schema/](packages/db/src/schema/)
- [migrations/](packages/db/migrations/)
- [client.ts](packages/db/src/client.ts)

## packages/providers 🟢
_verified: 2026-09-25_

Vendor abstraction — interfaces + factories for embedding, queue, and auth providers. The module teacher runs on AgentPlatform (ADR-031); this package no longer carries an LLM or checkpointer provider.

**Agent surface**
- MCP: none
- Skills: none
- Hooks: none
- Agents: none

**Stack**
- Embedding: LangChain OpenAIEmbeddings (Cohere is a stub)
- Queue: GCP Cloud Tasks / loopback HTTP
- Auth: Supabase JWKS JWT verification
- Switches wired: `EMBEDDING_PROVIDER`, `QUEUE_PROVIDER`, `AUTH_PROVIDER`; `mock` providers are e2e-only

**Secrets**
- prod: GCP Secret Manager (via consuming services)
- dev: [.env.example](.env.example) → `.env.dev`

**State** — Embedding, queue, and auth providers exercised in prod. Cohere embedding provider is a stub.

**Useful Files**
- [factory.ts](packages/providers/src/factory.ts)
- [interfaces/](packages/providers/src/interfaces/)
- [implementations/](packages/providers/src/implementations/)

## packages/env 🟢
_verified: 2026-09-30_

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
_verified: 2026-09-30_

Zod schemas validating API request bodies and LLM output at service boundaries.

**Agent surface**
- MCP: none
- Skills: none
- Hooks: none
- Agents: none

**Stack**
- Validation: Zod; consumed via NestJS `ZodValidationPipe`. `TeacherReplySchema` validates the platform's `course-teacher` reply in `ApiPlatformClient` (ADR-031) — the agent service's own JSON-output parsing (the completion evaluator) went with the module-chat graph.

**Secrets**
- prod: none
- dev: none

**State** — In prod via all three services.

**Useful Files**
- [src/](packages/schemas/src/)

## packages/types 🟢
_verified: 2026-09-30_

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
_verified: 2026-09-30_

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
_verified: 2026-09-30_

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
_verified: 2026-09-30_

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
