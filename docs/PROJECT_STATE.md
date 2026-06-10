# Project State

> **Status report for developers and AI agents — not user documentation.**
> Generated 2026-06-05 from source code, tests, and config on branch `fix/mobile-tamagui-v2-runtime-tokens` (commit `96ebc6a`).
> Where code and docs disagreed, code won. Assumptions are marked **[ASSUMPTION]**.

---

## Vision

Autodidact is an AI-powered learning platform. A user names a topic; the system generates a structured, multi-module course on demand, then teaches each module through a stateful AI chat tutor that decides when the learner has mastered the material and unlocks the next module. The only client is an Expo React Native mobile app; all intelligence lives in backend services.

The architecture deliberately separates concerns: a public HTTP API (NestJS) owns auth and orchestration but runs no models; an internal AI runtime (Fastify + LangGraph) owns every LLM/embedding call; a background worker (BullMQ) owns long-running course generation. Vendor choices (LLM provider, queue, auth, checkpointer) sit behind a provider-abstraction package so they can be swapped via env vars. The project is engineered for production from the start — Terraform IaC, GCP Cloud Run deployment, gated CI — but is being built by what appears to be a solo developer and has not yet been operationally hardened or proven under real traffic.

---

## Current State

### services/api — Public HTTP API (NestJS)

#### Purpose
Stateless public gateway for the mobile client. Owns auth verification (single source via `IAuthProvider`/Supabase), course create-or-reuse orchestration (embedding similarity + job enqueue), chat session management with SSE proxying to the agent, and sequential module-progress tracking. Runs **no** AI models.

#### Status
**Functional**

#### Implementation
Five modules with real controllers and services: `courses` (`POST/GET /courses`, status, enroll), `chat` (sessions + SSE `…/stream` proxy), `progress` (`GET /progress/:courseId`, completeModule unlock logic), `auth` (Bearer guard), `health`. `createOrReuse()` runs a pgvector cosine-similarity check (threshold 0.92) before inserting a new course and enqueuing a BullMQ job. Chat streams are bridged via RxJS and persisted, triggering module completion when score ≥ 60. All inputs validated with Zod pipes; global exception filter; env validated at boot. Evidence: `services/api/src/modules/courses/courses.service.ts`, `…/chat/chat.service.ts`, `…/progress/progress.service.ts`.

#### Infrastructure
- **Database:** PostgreSQL via Drizzle (`@autodidact/db`) — writes `courses`, `modules`, `enrollments`, `module_progress`, `chat_sessions`; pgvector for similarity.
- **Queue:** BullMQ + Redis (enqueue only) via `IQueueProvider`.
- **Auth:** Supabase via `IAuthProvider`.
- **External services:** calls `services/agent` over HTTP (`AGENT_SERVICE_URL`) for embeddings and chat SSE.
- **Observability:** `@autodidact/observability` structured logging.

#### Readiness
| Area | Status |
|---|---|
| Builds | ✅ (CI-gated; not re-run locally for this report) |
| Tests | ✅ 10 test files, real assertions |
| Database Connected | ✅ |
| Auth Connected | ✅ |
| Production Config | ⚠️ CORS `origin: '*'`; no graceful DB/Redis cleanup; `AGENT_SERVICE_URL` read via `?? 'http://localhost:3001'` fallback in 3 places, not in env schema |
| Monitoring | ⚠️ logging only; `/health` checks DB + agent, no probes wired in code |

#### Known Issues
- `AGENT_SERVICE_URL` fallback to localhost is unvalidated — can mask prod misconfig (`chat.controller.ts`, `health.controller.ts`, `agent.client.ts`).
- Generic `throw new Error('Failed to create course')` instead of an `HttpException` (`courses.service.ts`).
- No retry/backoff on agent HTTP calls — slow agent startup fails course creation immediately.
- Unused/duplicated `courseId` param when creating chat sessions (`chat.controller.ts`).

#### Next Step
Add `AGENT_SERVICE_URL` to the boot env schema and a retry/timeout wrapper around agent calls; tighten CORS for production.

---

### services/agent — AI Runtime (Fastify + LangGraph)

#### Purpose
Internal-only AI orchestration (port 3001, never publicly exposed). Runs two LangGraph graphs — **course-generation** (stateless, 3-retry blueprint loop) and **module-chat** (stateful teacher→evaluator with checkpointer) — and serves embeddings. All system prompts come from `@autodidact/prompts`.

#### Status
**Functional**

#### Implementation
Routes: `POST /course/generate`, `POST /module-chat/stream` (SSE token streaming), `POST /embeddings/text`, `GET /health`. Course-generation node extracts JSON (handles markdown fences), validates against `CourseBlueprintSchema`, retries up to 3×. Module-chat teacher node detects/strips a `[MODULE_COMPLETE:score=N]` marker and conditionally routes to an evaluator node returning `{completed, score, feedback}`. Checkpointer backend (memory vs Postgres) is env-controlled. Evidence: `services/agent/src/graphs/**/nodes.ts`, `…/routes/module-chat.ts`.

#### Infrastructure
- **LLM:** OpenAI (default) or Anthropic via `ILLMProvider` (`LLM_PROVIDER`).
- **Embeddings:** OpenAI text-embedding-3-small (1536-dim).
- **Checkpointer:** in-memory (default) or Postgres (`CHECKPOINTER=postgres`, needs `DATABASE_URL`).
- **Prompts:** `@autodidact/prompts`.
- Called only by `services/api` and `services/worker`.

#### Readiness
| Area | Status |
|---|---|
| Builds | ✅ (CI-gated) |
| Tests | ✅ 4 test files (graph/route mocks) |
| Database Connected | ⚠️ only when `CHECKPOINTER=postgres` |
| Auth Connected | N/A (internal service, trusts callers) |
| Production Config | ⚠️ no timeout on LLM/graph execution; `/health` is a hardcoded OK with no dependency checks |
| Monitoring | ⚠️ logging only; graph nodes do not emit traces |

#### Known Issues
- **Evaluator fallback score = 75** on JSON parse failure — above the 60 completion threshold, so a malformed evaluator response auto-completes the module (`module-chat/nodes.ts`).
- No execution timeout on `stream()`/`invoke()` — a stuck LLM hangs the request.
- No validation of LLM response shape beyond JSON parsing.
- Completion-marker regex does not range-check the score.

#### Next Step
Add execution timeouts and make the evaluator fallback fail-closed (do not complete on parse failure).

---

### services/worker — Background Processor (BullMQ)

#### Purpose
Always-on daemon (no HTTP). Consumes two queues: `course-generation` (calls agent, writes blueprint+modules in a transaction, flips course to `ready`, enqueues embedding) and `embedding` (calls agent, stores topic vector). Only service that writes `courses.status = 'ready'`.

#### Status
**Functional**

#### Implementation
Two processor factories wired in `main.ts` with concurrency 3 (course-gen) and 5 (embedding), exponential backoff (5/25/125s), and SIGTERM/SIGINT shutdown closing workers + Redis. Course-gen holds an atomic DB transaction for the blueprint+module insert; embedding uses raw SQL with a `::vector` cast (Drizzle `.set()` limitation). Evidence: `services/worker/src/processors/*.processor.ts`.

#### Infrastructure
- **Database:** PostgreSQL via Drizzle (writes `courses`, `modules`, `topic_embedding`).
- **Queue:** BullMQ + Redis (consumes both queues).
- **External services:** agent HTTP (`AGENT_SERVICE_URL`).

#### Readiness
| Area | Status |
|---|---|
| Builds | ✅ (CI-gated) |
| Tests | ✅ 3 test files (processor + client mocks) |
| Database Connected | ✅ |
| Auth Connected | N/A |
| Production Config | ⚠️ no agent retry; DB transaction held open across the slow agent call; no dead-letter handling |
| Monitoring | ⚠️ logging + BullMQ `failed` events only; no heartbeat/metrics |

#### Known Issues
- **Stuck-course recovery missing:** if all retries fail, the course stays `status = 'generating'` forever — no reset/cleanup job.
- No idempotency guard on module inserts if a retry lands after a partial commit.
- DB connection held during the (untimed) agent call can exhaust the pool under load.
- Concurrency is hardcoded, not configurable.

#### Next Step
Add a failure path that flips stuck courses to `failed`, and move the agent call outside the DB transaction with a timeout.

---

### apps/mobile — Expo React Native App (the only UI)

#### Purpose
The entire client surface. Talks only to `services/api` (REST + SSE). Handles auth, course creation/enrollment, module progression, and the streaming AI tutor chat.

#### Status
**Functional** (UI is mature; **not** "production ready" by this report's bar because there are no automated tests and no release/EAS build config).

#### Implementation
Expo SDK 52, Expo Router 4 file-based routing. Screens: auth (sign-in/up), home (topic → create → poll job), my-courses list, course detail (module list with locked/completed states), and module chat (SSE token-by-token). State: TanStack Query (server) + Zustand (auth in expo-secure-store, in-memory chat buffer). API layer (`src/api/client.ts`) injects bearer tokens with 401 refresh. Design system fully migrated to Tamagui v2 runtime tokens (dark theme only). Evidence: `apps/mobile/app/**`, `src/api/`, `src/stores/`, `src/design/`.

#### Infrastructure
- **Auth:** Supabase (`supabaseUrl`, publishable key from `app.json`).
- **API:** `API_BASE_URL` from `app.json` (defaults to `http://localhost:3000/v1`).
- Tamagui 2.0.0-rc.41 (pinned RC), TanStack Query 5, Zustand 5, RN 0.76.

#### Readiness
| Area | Status |
|---|---|
| Builds | ⚠️ typecheck-gated; no production/EAS build configured |
| Tests | ❌ no automated tests (manual verification per `apps/mobile/CLAUDE.md`); Maestro e2e scaffold referenced but no test files present |
| Database Connected | ✅ (indirectly via API) |
| Auth Connected | ✅ Supabase session + secure-store |
| Production Config | ❌ no EAS config; Supabase creds + default API URL hardcoded in `app.json` |
| Monitoring | ❌ none (no crash/error reporting) |

#### Known Issues
- No automated tests (architectural choice) → regressions only caught manually.
- Tamagui pinned to a release candidate; editing tokens requires clearing `$TMPDIR/metro-cache` + `apps/mobile/.tamagui` (see `[[project_tamagui_token_cache]]`).
- Dark theme only; `module_progress.chatSessionId` is a reserved Phase-2 column, unpopulated.

#### Next Step
Add EAS build config + crash reporting, and a minimal Maestro/unit smoke suite for the auth → create → chat happy path.

---

### packages/* — Shared Libraries

| Package | Purpose | Status | Tests | Notes |
|---|---|---|---|---|
| `db` | Drizzle schema + pgvector + client | **Functional** | vector serialization test | 4 sequential SQL migrations (0001 schema, 0002 indexes, 0003–0004 RLS); 6 tables + 3 enums; custom 1536-dim `vector` type; WSL2 needs the 6543 pooler |
| `providers` | Vendor abstraction (LLM/embedding/queue/auth/checkpointer) | **Functional** | factory + provider tests | Cohere embedding provider is a **stub that throws**; `EMBEDDING_PROVIDER` env var is ignored (always OpenAI) |
| `schemas` | Zod validation at boundaries + LLM output | **Functional** | 3 test files | `ModuleBlueprintSchema.id` intentionally optional |
| `types` | Shared TS types | **Functional** | none (types only) | — |
| `prompts` | LLM prompt templates | **Functional** | 3 test files | Completion marker `[MODULE_COMPLETE:score=N]` format mirrored in agent regex |
| `observability` | pino + OTEL | **Functional** | logger test | Tracer is **opt-in** and no-op unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set |
| `config` | tsconfig/eslint/prettier/vitest bases + test mocks | **Production Ready** | n/a | Shared mock factories for all providers |
| `env` | Boot-time Zod env validation per service | **Functional** | env test | Fail-fast with all issues listed |

> **[ASSUMPTION]** A sub-agent reported the API auth env vars as `SUPABASE_PROJECT_URL`/`SUPABASE_ANON_KEY`, but `.env.example`, root `CLAUDE.md`, and project memory specify `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY`. Treat the publishable/secret naming as authoritative and verify the provider package matches before deploy.

---

### Infrastructure & CI/CD

#### Purpose
Containerized deployment to GCP Cloud Run with Terraform IaC and gated GitHub Actions.

#### Status
**Functional / configured** — the pipeline and IaC exist and are wired; **[ASSUMPTION]** an actual production environment exists and has been deployed (deploy runs on push to `master`), but this report cannot confirm live infrastructure or traffic.

#### Implementation
- **CI** (`.github/workflows/ci.yml`): on PR + push to master → install → `pnpm lint` → `pnpm typecheck` → `pnpm test`.
- **Deploy** (`.github/workflows/deploy.yml`): on push to master / manual → lint+typecheck+test gate → OIDC auth to GCP (no static keys) → build & push 3 Docker images to Artifact Registry → run DB migrations (`PROD_DATABASE_URL` secret) → `gcloud run deploy` for `autodidact-api`, `-agent`, `-worker`. Uses GitHub `environment: production` (approval gate available via repo settings — enforcement not verifiable from code).
- **IaC** (`infra/`): Terraform modules for `artifact-registry`, `redis` (Memorystore), `cloud-run-service`; `environments/prod`; GCS remote state (`backend.tf`).
- **Local dev:** `docker-compose.yml` (Postgres + Redis); per-service `Dockerfile`s; pnpm 9.12.3 + Node ≥20 + Turbo.
- **Other workflows:** several Claude-automation workflows (PR review, triage, doc-sync, weekly maintenance, ADR review).

#### Readiness
| Area | Status |
|---|---|
| Builds | ✅ Docker images for all 3 services |
| Tests | ✅ gated in CI and deploy (25 tracked test files across services/packages) |
| Database Connected | ✅ migrations run in deploy |
| Auth Connected | ✅ Supabase |
| Production Config | ⚠️ Terraform present; live state unverified; no automated rollback |
| Monitoring | ❌ logs ship to Cloud Logging via stdout, but **OTEL traces are not exported** (endpoint unset) and there is **no error tracking** (Sentry/Datadog) |

#### Known Issues
- No automated rollback strategy (manual `terraform apply` / revision pin).
- Trace export unconfigured → spans silently dropped despite OTEL instrumentation.
- No error/crash aggregation anywhere in the stack.
- **Not a security issue:** `.env.prod` exists on disk but is **gitignored and not tracked** (verified via `git ls-files`). Only `.env.example`/`.envrc.example` are committed.

#### Next Step
Wire `OTEL_EXPORTER_OTLP_ENDPOINT` to a real collector and add error tracking; confirm the GitHub production approval gate is enforced.

---

## System Health Summary

### Production Readiness
**~65% — Beta.**

Reasoning: the full feature surface is implemented and tested at the unit level across all three backend services and the shared packages; the mobile app is feature-complete; CI is gated and a real Cloud Run deploy pipeline + Terraform IaC exist. That is well beyond MVP. It falls short of Production Candidate because the operational hardening that production demands is missing: no request timeouts or retries between services, no recovery for stuck course-generation jobs, an evaluator that fails *open* (auto-completes on malformed output), no trace export or error tracking, no mobile tests or crash reporting, no rollback strategy, and no evidence of load testing or real traffic. The system would likely *function* in production but cannot yet be *operated* with confidence.

### Critical Risks
1. **Fail-open module completion** — evaluator's fallback score (75) completes modules on malformed LLM output. Correctness/integrity risk.
2. **No inter-service timeouts/retries** — a slow or down agent cascades into failed course creation and a DB transaction held open in the worker.
3. **Stuck courses are unrecoverable** — failed generation leaves rows permanently in `generating` with no cleanup.
4. **No production observability** — traces dropped, no error tracking; failures in prod would be near-invisible.
5. **Mobile has zero automated tests and no crash reporting** — the only UI regresses silently.

### Missing Infrastructure
- Error/crash tracking (Sentry/Datadog) — ADR-deferred to post-MVP.
- Trace export endpoint (OTEL collector).
- Automated rollback / canary strategy.
- Rate limiting on the public API.
- Mobile EAS build + release pipeline.
- Load/integration testing across the full course-generation flow.

---

## Current Bottleneck

**Operational hardening and observability, not feature development.** The product is built; what blocks it from production is the absence of the resilience and visibility layer — timeouts, retries, failure recovery, trace/error export. The single largest constraint is that **failures are currently silent and uncontained**: there is no way to see what breaks in production, and several failure modes (stuck courses, fail-open completion, agent timeouts) have no guardrails. Until that exists, every production issue is a blind, manual investigation — which is untenable for a solo maintainer.

---

## Progression Path

After observability + resilience are in place, the likely next constraints, in order:

1. **End-to-end / integration test coverage** — unit tests mock every boundary; nothing exercises the real API→worker→agent→DB flow, so contract drift between services goes undetected.
2. **Mobile release pipeline** — EAS build, signing, OTA updates, and crash reporting become the gate to getting the app into testers' hands.
3. **LLM cost, latency, and quality control** — once real usage starts, course-generation cost/latency and blueprint quality (retries, prompt tuning, eval) dominate.
4. **Data lifecycle & scaling** — pgvector index tuning for similarity at scale, Redis/queue capacity, Cloud Run concurrency and cold-start tuning.
5. **Auth/security hardening** — tighten CORS, rate limiting, RLS audit, secret rotation, and the deferred auth-provider reconsideration (Supabase Auth → alternatives).

---

## Current Objective

**[INFERRED]** The team is in a *stabilization and tooling* phase, not feature expansion.

Evidence:
- Recent commits are almost entirely build/CI/UI stabilization: `complete Tamagui v2 runtime token migration`, `resolve Tamagui v2 typecheck errors blocking CI`, the WSL2 emulator skill, and the active branch `fix/mobile-tamagui-v2-runtime-tokens`.
- Several added Claude-automation workflows (PR review, triage, doc-sync, weekly maintenance) and an untracked `docs/AImanagementTODO.md` point to investment in **agent/developer tooling and process**, not product features.
- No recent commits add new endpoints, screens, or graphs — the functional surface is being *stabilized*, not grown.

The immediate objective appears to be: **get the mobile app building cleanly on the migrated Tamagui v2 stack with green CI, and stand up the AI-assisted development/maintenance tooling around the repo.**

---

## Open Questions

- **Is there a live production deployment today?** deploy.yml targets it, but live Cloud Run / Supabase prod state is unverified here.
- **Is the GitHub `production` approval gate actually enforced?** Not determinable from code.
- **Which Supabase env var naming is canonical** in `packages/providers` — publishable/secret (docs) vs anon/project (one sub-agent's reading)? Must reconcile before deploy.
- **Should module completion fail open or closed?** Current behavior auto-completes on malformed evaluator output — is that intended?
- **What is the target scale?** Concurrency (worker 3/5, Cloud Run), pgvector index strategy, and LLM cost ceilings all depend on this.
- **What is the testing strategy for mobile and for cross-service flows** given the deliberate no-mobile-tests stance?

---

## Recommended Next Actions

### Immediate (unblock confidence now)
1. Make module completion **fail-closed**: do not complete on evaluator JSON parse failure (`services/agent/src/graphs/module-chat/nodes.ts`).
2. Add **timeouts** to all agent HTTP calls and to LangGraph `invoke`/`stream`; move the worker's agent call **outside** the DB transaction.
3. Add a **stuck-course recovery** path that flips exhausted jobs to `status = 'failed'`.
4. Add `AGENT_SERVICE_URL` to the boot env schema; remove the silent localhost fallback.

### Soon (before production)
5. Wire **OTEL trace export** and add **error tracking** (Sentry or equivalent) across services and mobile.
6. Add **integration tests** for the full course-generation and module-chat flows (real or testcontainer DB/Redis).
7. Configure **mobile EAS build + crash reporting**; add a Maestro smoke test for the happy path.
8. Tighten **API CORS** and add **rate limiting**; reconcile Supabase env-var naming.
9. Define and document a **rollback strategy** for Cloud Run + migrations.

### Later (can wait)
10. Retry/backoff or circuit breaker between all services.
11. pgvector index tuning + queue capacity planning for scale.
12. Light theme for mobile; populate the reserved `chatSessionId` (Phase 2).
13. Revisit deferred ADRs (BullMQ → Cloud Tasks, Tamagui → NativeWind, Supabase Auth → alternative) once usage data exists.

---

*Compiled from: source code (services + packages + mobile), test files, `.github/workflows/`, `infra/` Terraform, `docker-compose.yml`, `.env.example`, `.gitignore`, and git history. Sub-agent claims of "secrets committed to git" (false — `.env.prod` is gitignored) and "49 test files" (actual: 25 tracked) were corrected against direct repo inspection.*
