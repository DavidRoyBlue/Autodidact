# Professional Test Overhaul — Spec

**Date:** 2026-06-01
**Scope:** all services + packages + `apps/mobile` + CI
**Goal:** Raise the suite from "above-average solo project" to professional-grade: real-DB integration across every service, three e2e layers (API-level, cross-service, mobile), mobile unit/component coverage, enforced coverage gates, and full CI with real Postgres/Redis. LLM calls mocked-by-default with a tiny opt-in live smoke suite.

---

## Context

The current suite's weaknesses are concentrated at the **edges and the client**: HTTP/SSE boundaries, the entire mobile app, provider leaf implementations, and no coverage floor. Verified ground truth: **24** test files, **203** cases, Vitest-only, **1** real-DB integration test, **0** mobile tests, **0** e2e tests, **no** coverage gate. ADR-018 (accepted 2026-05-10) chose Vitest + Testcontainers and explicitly deferred mobile testing and e2e to "their own ADR" — this overhaul closes both. Full gap analysis is in the Appendix.

---

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Scope | Full overhaul | Edges, client, and provider leaves all unguarded; incremental leaves false confidence |
| E2E layers | API-level + cross-service + mobile | Each catches a class the others miss: HTTP contract, service-to-service drift, real-device UX |
| LLM in tests | Mocked-by-default + tiny live smoke | Determinism + zero cost on PRs; live smoke (nightly/manual) keeps provider contract honest |
| Coverage targets | Services 80%, infra pkgs 85%, pure pkgs 100%, mobile 50% | Professional floor without chasing diminishing returns; ratcheted, not big-bang |
| Mobile unit runner | jest-expo + `@testing-library/react-native` | Canonical Expo testing path; introduces Jest as 2nd runner (ADR-worthy) |
| Mobile e2e | Maestro | Low-ceremony YAML flows, no native build glue, strong RN support |
| Cross-service e2e | Kept | Highest-fidelity regression net for api↔agent↔worker contracts |
| Provider seam | `LLM_PROVIDER=mock` swap | Run real services with a mock model instead of stubbing `fetch` — one seam, high fidelity |

---

## Architecture & principles

A **test pyramid** layered onto the existing structure, with **one mock seam per layer, real everything else**:

| Layer | Runner | Infra | LLM | Mocks |
|---|---|---|---|---|
| Unit | Vitest | none | mocked | collaborators mocked |
| Integration | Vitest | real PG + Redis (Testcontainers) | mocked | LLM only |
| API-level e2e | Vitest + supertest | real PG + Redis | mocked | LLM only |
| Cross-service e2e | Vitest/compose | real PG + Redis + all 3 services | **mock provider** | model only |
| Mobile unit/component | jest-expo | none | n/a | network/native mocked |
| Mobile e2e | Maestro | running backend | mock provider | model only |
| Live smoke | Vitest (tagged) | real OpenAI | **real** | none |

`packages/providers` already supports an `LLM_PROVIDER` swap. Cross-service e2e exploits that: real services, mock model.

---

## Components

### 1. `packages/test-support` (new, foundational)
Extract the Testcontainers harness that is currently inline in one file:
- `withTestDatabase()` — boots `pgvector/pgvector:pg16`, runs **all** migrations (not just `0001` — exercises indexes + RLS), returns a Drizzle client + teardown.
- `withTestRedis()` — boots Redis for BullMQ integration.
- **Seed factories** — typed builders for users/courses/modules/enrollments/progress; composes with `sampleUser`/`sampleBlueprint` in `packages/config`.
- Shared migration runner used by every integration suite.
- Built on the canonical mock factories per `packages/config/CLAUDE.md` — no ad-hoc mocks.

### 2. Coverage gates (`packages/config/vitest.base.ts`)
Per-package thresholds via config overrides, **ratchet strategy**: Phase 0 sets a soft floor at current measured coverage; Phase 5 enforces tiered targets. CI fails on regression once enforced.

### 3. Per-layer test additions
- **api**: promote `chat`/`courses` tests from mocked-DB to **real DB** (Finding A); controller tests; **API-level e2e harness** (`Test.createTestingModule` → `supertest`) covering auth-reject (401/403), validation (400), exception filter, health, and chat/courses/progress routes.
- **agent**: the missing **`/module-chat` SSE streaming test** (Fastify `inject`, assert event framing + interruption — Finding C); graph-composition tests; `module-chat` route.
- **worker**: **real Redis** enqueue→process→DB integration; graceful-shutdown (SIGTERM/SIGINT) test.
- **providers**: unit tests for OpenAI/Anthropic LLM + OpenAI/Cohere embedding impls — init, API-key-missing, timeout, rate-limit (Finding D); checkpointer impls. Add a `mock` LLM provider to the factory for e2e if absent.
- **db**: query-layer integration against real PG (Finding E).
- **observability**: `tracer.ts`.

### 4. Cross-service e2e: `e2e/` (new workspace package)
docker-compose (or Testcontainers-orchestrated) harness: postgres + redis + api + agent + worker, `LLM_PROVIDER=mock`. Golden-path journey: **create course → worker generates (mock LLM) → enroll → chat turn → complete module → next unlocks**, plus failure paths (generation failure, auth rejection).

### 5. Mobile
- **jest-expo** setup (preset, RN Testing Library). Unit/component: `useSSE` & `useCourseGeneration` hooks, the three Zustand stores (auth/chat/toast), API clients, key components (Finding B).
- **Maestro**: flows for login → browse → generate → learn-a-module against a backend.

### 6. CI restructure (`.github/workflows/`)
Split the monolithic `validate` into parallel jobs: `lint-typecheck`, `unit`, `integration` (services: postgres+redis), `e2e` (compose), `mobile-unit` (jest), `mobile-e2e` (Maestro — nightly/manual), plus a **coverage-merge gate**. Live smoke as a separate **scheduled nightly** workflow (never blocks PRs). Deploy gate runs unit+integration+e2e.

### 7. ADRs (two, deferred by ADR-018)
- **(a)** Second test runner (jest-expo alongside Vitest) + mobile testing strategy.
- **(b)** E2E strategy (provider-swap + compose).
Drafted via the `write-adr` skill during the plan.

---

## Phasing (each phase ships green)

- **Phase 0 — Foundation:** `packages/test-support` harness; soft coverage scaffolding; the two ADRs.
- **Phase 1 — Backend integration depth:** api real-DB (chat/courses promotion), worker Redis, providers impl tests, db query tests, observability tracer, agent SSE + graph composition.
- **Phase 2 — API-level e2e:** NestJS app + supertest harness; auth/controllers/filter/health journeys.
- **Phase 3 — Cross-service e2e:** `e2e/` package + compose harness; golden-path + failure journeys with mock LLM provider.
- **Phase 4 — Mobile:** jest-expo unit/component (hooks → stores → clients → components), then Maestro e2e.
- **Phase 5 — Hardening:** enforce coverage ratchet (80/85/100, mobile 50); live smoke suite; CI job restructure; docs/ADR finalization.

---

## Testing & verification

- Per-package: `pnpm test <pkg>`; full gate `pnpm test`; coverage `pnpm test -- --coverage`.
- New real-DB tests follow the `progress.service.integration.test.ts` Testcontainers pattern, now via `packages/test-support`.
- Cross-service e2e: `pnpm test e2e` (boots compose, runs journey, tears down).
- Mobile: `pnpm --filter mobile test` (jest) and `maestro test .maestro/` (e2e).
- Live smoke: opt-in env flag (e.g. `LIVE_SMOKE=1`), nightly workflow only.
- Each phase must leave `pnpm test` green and not regress coverage.

---

## Out of scope / YAGNI

- No rewrite of existing passing tests beyond the chat/courses promotion.
- No new product features — test infrastructure only.
- No load/perf testing (separate concern).
- Live smoke stays *tiny* — provider-contract sanity only.

---

## Appendix — Test Suite Analysis (ground truth)

### Verified numbers
| Metric | Value |
|---|---|
| Test files | **24** (an agent reported 48 — double-counted a `.worktrees/ui-enabled/` mirror) |
| Test cases | **203** |
| Framework | **Vitest 2.1.0 only** — pattern `src/__tests__/**/*.test.ts` |
| Skipped/todo/only | **0** |
| Real-DB integration | **1 file** (`progress.service.integration.test.ts`, Testcontainers `pgvector/pgvector:pg16`) |
| Coverage thresholds | **None** (reported, never gated) |
| Mobile tests | **0** across 32 source files |
| E2E tests | **0** |

### Findings (gaps)
- **A** — `chat`/`courses` `*.integration.test.ts` both `vi.mock('@autodidact/db')`; only `progress` hits real DB. Mislabeled.
- **B** — `apps/mobile`: 32 source files, 0 tests (components, `useSSE`/`useCourseGeneration` hooks, auth/chat/toast stores, API clients).
- **C** — HTTP edges untested: no api controller/route tests; no proof a guarded route 401s; agent `/module-chat` SSE streaming untested; graph composition untested; no e2e.
- **D** — LLM (OpenAI/Anthropic) + embedding (OpenAI/Cohere) provider impls untested (key-missing/timeout/rate-limit); only factory selection covered.
- **E** — `packages/db` ~3% (only `vector.test.ts`); query builders only exercised through mocks.
- **F** — no coverage gate anywhere; coverage can silently erode.
- Smaller — `observability/tracer.ts` untested; worker graceful-shutdown untested.

### What's already good
Documented strategy (ADR-018), enforced mock-factory conventions (`packages/config/CLAUDE.md`), CI/deploy gating, zero skipped tests, and one well-placed real-DB test (the module-completion cascade — the right place to spend a container).
