# Architecture Decision Records

Durable records of architectural decisions for Autodidact.

## What is an ADR here?

Each ADR frames an **architectural decision area** (e.g., "Database platform"),
surveys multiple valid options neutrally, and concludes with a choice. ADRs are
a thinking tool, not a checklist. See [AGENTS.md](./AGENTS.md) for the rules
and the bar.

## Folder layout

```
ADRs/
├── ADR-000-ADRtemplate.md
├── apps/        — apps/* decisions (mobile)
├── services/    — services/* decisions (api, agent, worker)
├── packages/    — packages/* decisions (db, providers, schemas, observability, ...)
├── infra/       — hosting, IaC, CI/CD
├── cross-cutting/ — decisions that span ≥2 areas
└── _superseded/ — historical originals replaced by newer ADRs
```

## Index

Sort within each section by ADR number.

### Cross-cutting
- [ADR-001 — Monorepo & build orchestration](./cross-cutting/ADR-001-monorepo-build-orchestration.md)
- [ADR-002 — Database platform](./cross-cutting/ADR-002-database-platform.md)
- [ADR-018 — Testing strategy](./cross-cutting/ADR-018-testing-strategy.md)
- [ADR-019 — Code quality tooling](./cross-cutting/ADR-019-code-quality-tooling.md)
- [ADR-020 — Authentication strategy](./cross-cutting/ADR-020-authentication-strategy.md)
- [ADR-023 — Defer the LangChain/LangGraph 1.x major upgrade](./cross-cutting/ADR-023-langchain-1x-upgrade-deferral.md)
- [ADR-025 — Mobile testing strategy and second test runner](./cross-cutting/ADR-025-mobile-testing-second-runner.md)
- [ADR-026 — End-to-end testing strategy](./cross-cutting/ADR-026-e2e-testing-strategy.md)
- [ADR-028 — Production auth: identity contract, hybrid provisioning, and data-path posture](./cross-cutting/ADR-028-production-auth-provisioning.md) — Accepted 2026-06-19

### Apps — Mobile
- [ADR-003 — Mobile application platform](./apps/mobile/ADR-003-mobile-application-platform.md)
- [ADR-013 — Mobile UI system](./apps/mobile/ADR-013-mobile-ui-system.md) *(⬛ superseded by ADR-029)*
- [ADR-014 — Mobile navigation](./apps/mobile/ADR-014-mobile-navigation.md)
- [ADR-015 — Mobile state management](./apps/mobile/ADR-015-mobile-state-management.md)
- [ADR-029 — Mobile UI system — NativeWind + React Native Reusables](./apps/mobile/ADR-029-mobile-ui-system-nativewind.md)

### Services
- [ADR-004 — REST API framework](./services/api/ADR-004-rest-api-framework.md)
- [ADR-005 — AI agent server framework](./services/agent/ADR-005-ai-agent-server-framework.md)
- [ADR-006 — AI orchestration framework](./services/agent/ADR-006-ai-orchestration-framework.md)
- [ADR-011 — Real-time streaming transport](./services/agent/ADR-011-realtime-streaming-transport.md)
- [ADR-024 — Content RAG storage & retrieval for grounded tutoring](./services/agent/ADR-024-content-rag-storage-and-retrieval.md)
- [ADR-027 — Background job queue — migrate to GCP Cloud Tasks](./services/worker/ADR-027-background-job-queue-cloud-tasks.md) (supersedes [ADR-007](./_superseded/ADR-007-background-job-queue.md))

### Packages
- [ADR-008 — ORM / data access layer](./packages/db/ADR-008-orm-data-access.md)
- [ADR-010 — Vector search strategy](./packages/db/ADR-010-vector-search-strategy.md)
- [ADR-009 — External vendor abstraction](./packages/providers/ADR-009-external-vendor-abstraction.md)
- [ADR-016 — Runtime schema validation](./packages/schemas/ADR-016-runtime-schema-validation.md)
- [ADR-017 — Observability stack](./packages/observability/ADR-017-observability-stack.md)

### Infrastructure
- [ADR-012 — Cloud hosting platform](./infra/ADR-012-cloud-hosting-platform.md)
- [ADR-021 — Infrastructure as code](./infra/ADR-021-infrastructure-as-code.md)
- [ADR-022 — CI/CD platform](./infra/ADR-022-cicd-platform.md)

## 🚩 Open reconsiderations

ADRs whose honest analysis concluded that a *different* tool would be a better
fit, but where we are staying with the current choice for legacy/inertia/cost
reasons. Each entry names the trigger condition under which we should migrate.

- [ADR-020 — Authentication strategy](./cross-cutting/ADR-020-authentication-strategy.md): would-be-better → **Better Auth** (TS-native, Drizzle-integrated, no vendor lock-in). Trigger: Supabase Auth incident >2h, MAU costs >$200/mo, custom-session feature need, or a planned auth refresh.

*(ADR-013 — Mobile UI system reconsideration flag resolved: migrated to NativeWind v4 in ADR-029, 2026-06-22.)*

## Conventions

**Filenames:** `ADR-NNN-decision-area-slug.md`. Numbers are global, zero-padded
to 3 digits, never reused.

**Status values:** `Proposed`, `Accepted`, `🚩 Accepted with reconsideration flag`,
`Deprecated`, `Superseded by ADR-NNN`.

**Append-only for decisions.** Documentation-quality improvements on accepted
ADRs are allowed in-place; decision changes require a new superseding ADR. See
[AGENTS.md](./AGENTS.md) for full rules.

**Scope.** Decision-area ADRs, not per-tool. One architectural problem per ADR;
multiple options compared neutrally; first-principles reasoning required.

## Related

- [Architecture overview](../README.md)
- [Stack](../../stack.md) — links each tool to its decision-area ADR
- [Template](./ADR-000-ADRtemplate.md)
- Root [AGENTS.md](../../../AGENTS.md)
