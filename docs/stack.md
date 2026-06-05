# Stack Decisions

Each row links to the ADR documenting the choice (drivers, alternatives, rationale, and any reconsideration flag). 🚩 = an open reconsideration flag.

## Monorepo
- **pnpm + Turborepo** — workspace management + task orchestration. → [ADR-001](architecture/ADRs/cross-cutting/ADR-001-monorepo-build-orchestration.md)

## Mobile
- **Expo + React Native** — cross-platform mobile from one TS codebase. → [ADR-003](architecture/ADRs/apps/mobile/ADR-003-mobile-application-platform.md)
- **Expo Router** — file-based navigation. → [ADR-014](architecture/ADRs/apps/mobile/ADR-014-mobile-navigation.md)
- **Tamagui** 🚩 — UI components and styling. → [ADR-013](architecture/ADRs/apps/mobile/ADR-013-mobile-ui-system.md)
- **TanStack Query v5 + Zustand v5** — server + client state. → [ADR-015](architecture/ADRs/apps/mobile/ADR-015-mobile-state-management.md)

## API
- **NestJS** — structured TypeScript backend with DI container. → [ADR-004](architecture/ADRs/services/api/ADR-004-rest-api-framework.md)

## Agent Runtime
- **Fastify** — lightweight HTTP for service-to-service streaming. → [ADR-005](architecture/ADRs/services/agent/ADR-005-ai-agent-server-framework.md)
- **LangGraph (TypeScript)** — stateful AI orchestration with checkpointing. → [ADR-006](architecture/ADRs/services/agent/ADR-006-ai-orchestration-framework.md)
- **SSE** — token streaming transport across agent → API → mobile. → [ADR-011](architecture/ADRs/services/agent/ADR-011-realtime-streaming-transport.md)

## Background Jobs
- **BullMQ + Redis** 🚩 — async course generation and embedding jobs. → [ADR-007](architecture/ADRs/services/worker/ADR-007-background-job-queue.md)

## Database
- **Supabase PostgreSQL** — managed Postgres with bundled auth + storage. → [ADR-002](architecture/ADRs/cross-cutting/ADR-002-database-platform.md)
- **Drizzle ORM** — TypeScript-first SQL builder with custom column types. → [ADR-008](architecture/ADRs/packages/db/ADR-008-orm-data-access.md)
- **pgvector** — vector similarity for course-topic reuse. → [ADR-010](architecture/ADRs/packages/db/ADR-010-vector-search-strategy.md)

## Authentication
- **Supabase Auth** 🚩 — JWT-based auth with native RLS integration. → [ADR-020](architecture/ADRs/cross-cutting/ADR-020-authentication-strategy.md)

## Validation
- **Zod** — runtime schema validation at HTTP and LLM boundaries. → [ADR-016](architecture/ADRs/packages/schemas/ADR-016-runtime-schema-validation.md)

## Observability
- **pino + OpenTelemetry** — structured logging + vendor-neutral tracing. → [ADR-017](architecture/ADRs/packages/observability/ADR-017-observability-stack.md)

## Provider Abstraction
- **Custom interfaces + factories** in `packages/providers` — all external vendor dependencies (LLM, embedding, queue, auth, checkpointer) accessed via env-var-driven factories. → [ADR-009](architecture/ADRs/packages/providers/ADR-009-external-vendor-abstraction.md)

## Hosting
- **GCP Cloud Run** — containerized serverless, scale-to-zero for stateless services. → [ADR-012](architecture/ADRs/infra/ADR-012-cloud-hosting-platform.md)

## Infrastructure as Code
- **Terraform** — declarative GCP infra; state in GCS. → [ADR-021](architecture/ADRs/infra/ADR-021-infrastructure-as-code.md)

## CI/CD
- **GitHub Actions** + Workload Identity Federation — keyless GCP auth from CI. → [ADR-022](architecture/ADRs/infra/ADR-022-cicd-platform.md)

## Testing
- **Vitest + Testcontainers** — fast unit tests; real-Postgres integration tests. → [ADR-018](architecture/ADRs/cross-cutting/ADR-018-testing-strategy.md)
- **jest-expo + React Native Testing Library** — mobile unit/component tests (Jest scoped to `apps/mobile`); **Maestro** for mobile e2e. → [ADR-025](architecture/ADRs/cross-cutting/ADR-025-mobile-testing-second-runner.md)
- **Layered e2e** — API-level (supertest), cross-service (compose), mobile (Maestro); LLM mocked via `LLM_PROVIDER=mock`, opt-in live smoke nightly. → [ADR-026](architecture/ADRs/cross-cutting/ADR-026-e2e-testing-strategy.md)

## Code Quality
- **ESLint + Prettier** — type-aware linting + format. → [ADR-019](architecture/ADRs/cross-cutting/ADR-019-code-quality-tooling.md)

## Mobile Distribution
- **EAS Build** — managed Expo build service for iOS + Android. (See [ADR-003](architecture/ADRs/apps/mobile/ADR-003-mobile-application-platform.md) for the platform decision.)

---

🚩 = open reconsideration flag. See [ADRs README](architecture/ADRs/README.md#-open-reconsiderations) for the full list and migration triggers.
