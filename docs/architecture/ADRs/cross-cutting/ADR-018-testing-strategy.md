# ADR-018: Testing strategy

## Status

Accepted
Date: 2026-05-10

## Context

Every package and service needs unit tests; the API service additionally
needs integration tests that exercise real Postgres (against migrations,
RLS policies, vector queries). The repo uses pnpm + Turbo
([ADR-001](./ADR-001-monorepo-build-orchestration.md)), so a test runner
needs to integrate with Turbo's task graph and produce coverage reports
per package.

Two structurally different test categories:

1. **Unit / fast tests** — pure functions, mocked providers via factories
   from `@autodidact/config/test-utils`. Run on every commit, every CI run,
   should complete in seconds.
2. **Integration tests with real Postgres** — pgvector queries, migrations,
   RLS. Need an actual running Postgres with our extensions. Cannot be
   unit-tested.

The runner choice and the integration-DB strategy are co-decided because
the integration tests run inside the same `vitest` invocation but with
different setup — picking different runners for the two categories adds
ceremony.

## Non-goals

- E2E tests against deployed services — out of scope; if added later, deserves its own ADR.
- Mobile UI tests — no mobile testing strategy in place yet.
- Mock factory conventions — owned by `packages/config/CLAUDE.md`.
- Coverage thresholds — operational, owned by per-package config.

## Decision Drivers

- **Speed** — fast tests are tests that get run; slow tests get skipped.
- **TypeScript-native** — no separate compile step; ESM-friendly.
- **Vitest workspace support** — we have a `vitest.workspace.ts`; the runner has to support multi-package config.
- **Coverage** — per-package coverage reports for CI visibility.
- **Real-Postgres integration** — pgvector queries can't be unit-mocked. Integration tests need a real database.
- **CI compatibility** — tests run on GitHub Actions ([ADR-022](./ADR-022-cicd-platform.md)). The integration setup must work in CI without a Mac.
- **Onboarding cost** — solo team; runner should require ~zero ceremony.

## Options Considered

### Option A: Vitest + Testcontainers (current)
**What it is:** Vitest as the test runner (Vite-based; ESM-native; Jest-compatible API). Testcontainers spins up ephemeral Docker containers (Postgres + pgvector) per test run / per test suite, applies migrations, and tears down after.

**Pros**
- Vitest is the fastest mainstream JS test runner in 2026 — meaningfully faster than Jest on most workloads, especially in watch mode.
- Native TypeScript / ESM; no `ts-jest` workaround.
- API-compatible with Jest (`describe`, `it`, `expect`, `vi.mock`); migration from Jest is mechanical.
- `vitest.workspace.ts` declares each package as a workspace; running `vitest` from the root tests everything; per-package coverage reports come for free.
- Testcontainers (`@testcontainers/postgresql`) gives real Postgres + pgvector per test, isolated, in seconds. Tests don't share state.
- Works in CI without special setup: GitHub Actions runners have Docker; Testcontainers spins up the container in the runner.
- Coverage via `@vitest/coverage-v8` — fast, reasonable defaults.

**Cons**
- Testcontainers requires Docker. Local dev needs Docker Desktop (or equivalent) running. CI usually has Docker; matters for self-hosted runners.
- Container startup adds 1–3 seconds per test suite that uses it. Fast for what it does, but not free.
- `vi.mock` semantics differ from `jest.mock` in subtle ways for module hoisting; very rarely a porting friction point.
- Vitest's plugin ecosystem is smaller than Jest's, but for our needs (coverage, mock factories) it's complete.

### Option B: Jest + Testcontainers
**What it is:** Jest (the long-incumbent JS test runner) with the same Testcontainers approach.

**Pros**
- Largest community / docs / Stack Overflow surface.
- Mature mock and snapshot APIs.
- Works everywhere.

**Cons**
- Slower than Vitest, especially in watch mode and on TS source.
- TS-via-Jest requires `ts-jest` or `babel-jest` — extra config and build step.
- ESM support has improved but is still less seamless than Vitest's.
- Mock module hoisting (`jest.mock` at top level) is the same source of friction Vitest's `vi.mock` inherits but with more historical baggage.

### Option C: Node.js built-in test runner (`node:test`)
**What it is:** Node 20+ ships a built-in test runner. No third-party dep.

**Pros**
- Zero dependencies. Smallest possible footprint.
- Stable, maintained by the Node project.

**Cons**
- API surface is smaller than Vitest/Jest. Mocking primitives (`mock.fn()`, `mock.module()`) are basic; complex mock patterns require manual implementation.
- TypeScript requires a transpilation step (`tsx` or pre-built JS).
- Coverage tooling is less polished than `@vitest/coverage-v8`.
- For a multi-package monorepo, the workspace ergonomics are bare; we'd build conventions ourselves.

### Option D: Bun test
**What it is:** Bun's built-in test runner. Fast. Bun-native.

**Pros**
- Very fast.
- Built-in; no separate runner to install.
- Jest-compatible API.

**Cons**
- Requires running on Bun. Our [monorepo](./ADR-001-monorepo-build-orchestration.md) decided against Bun for production for stability reasons; using Bun only for tests creates an inconsistency.
- Some Node-specific behaviors don't translate (we'd hit edge cases with `pg`, with how Bun handles certain modules).
- Smaller ecosystem; coverage and reporters less polished.

### Option E: Mocha + chai
**What it is:** Mocha test runner + chai assertion library. The classic combination.

**Pros**
- Mature, conservative, stable.
- Highly customizable.

**Cons**
- Mocha is in maintenance mode; new development is slow.
- Assertion-library-as-separate-dep is more boilerplate than Vitest/Jest's bundled `expect`.
- TypeScript via `ts-node` or pre-build.
- For a 2026 greenfield project, Mocha is contrarian.

### Option F: In-memory Postgres simulation (pg-mem)
**What it is:** JavaScript implementation of Postgres semantics, in-memory. Replaces Testcontainers for fast integration tests.

**Pros**
- No Docker required.
- Tests run in milliseconds.

**Cons**
- pg-mem is a Postgres *approximation*, not a real Postgres. Subtle SQL differences between pg-mem and real Postgres surface as bugs.
- Does not support pgvector or our other extension reliance — that alone disqualifies it for our integration needs.

### Option G: No integration tests (mock everything)
**What it is:** Mock the database layer entirely; only unit-test the application logic.

**Pros**
- No Docker, no integration setup, fast.

**Cons**
- The database layer (migrations, RLS, pgvector queries) is complex and error-prone enough that mocking it gives false confidence. Bugs in our SQL or RLS policies pass mocked tests and break production.
- Whole categories of bugs (transaction semantics, foreign-key cascades, index usage) become invisible.

## Decision

**We use Vitest as the test runner with Testcontainers for integration tests against real Postgres.**

## Rationale

Lining up the drivers:

- **Speed (#1)**: A is fastest. B (Jest) trails meaningfully. D fast but other costs. C and E slower for TS workloads.
- **TS-native (#2)**: A is best. D similar (Bun handles TS). B/C/E require config or transpile.
- **Workspace support (#3)**: A's `vitest.workspace.ts` is the cleanest. B has multi-project; less ergonomic for our shape. C is bare.
- **Coverage (#4)**: A's `@vitest/coverage-v8` is solid. B's istanbul is mature. C is OK; D and E weaker.
- **Real-Postgres (#5)**: A and B both work with Testcontainers. F is a mock that doesn't support pgvector — disqualified. G has the cost/benefit upside-down.
- **CI compat (#6)**: A and B both work on GitHub Actions. D requires Bun in CI. C/E fine.
- **Onboarding (#7)**: A's API is Jest-compatible — every JS dev knows it. B has the same API. C is more bare-bones. D requires Bun knowledge. E is dated.

What we are sacrificing by picking Vitest over Jest:

- The largest Stack Overflow / docs surface. Vitest's docs are excellent
  and the API is close enough to Jest that most Jest answers translate.

What we are sacrificing by picking Testcontainers over pg-mem or pure mocks:

- Test speed. Testcontainers adds ~1–3 s per integration suite. Worth it
  to get pgvector behavior tested against a real Postgres.

No reconsideration flag is raised. Vitest + Testcontainers is the
first-principles choice for our specific intersection (TS-monorepo,
ESM-native, real-Postgres requirement, CI on GitHub Actions).

## Consequences

### Positive
- Tests are fast. Watch mode is responsive.
- Same API as Jest — engineers from Jest backgrounds productive immediately.
- Real Postgres integration catches RLS bugs, migration bugs, pgvector-specific issues.
- Per-package coverage reports.
- One runner across all packages and services.

### Negative
- Local dev requires Docker for integration tests (already required for our `docker-compose` Postgres + Redis setup).
- Testcontainers spin-up adds time to integration suites.
- Vitest's mock module-hoisting has small differences from Jest; rarely an issue.

### Follow-up decisions
- Mock factory conventions for `IAuthProvider`, `ILLMProvider`, etc. — owned by `packages/config/CLAUDE.md`.
- Coverage thresholds and CI gates — operational, per-package.
- E2E test strategy if/when added — would deserve its own ADR.
- Reconsider this ADR if: a faster runner emerges that is materially faster *and* pluggable into our workspace setup, or our integration-test footprint grows enough that Testcontainers' startup cost becomes a real CI bottleneck (at which point a long-lived test database in CI may be cheaper).

## Update

**2026-09-01** — [ADR-027](../services/worker/ADR-027-background-job-queue-cloud-tasks.md)
executed ADR-007's flagged migration: Redis is gone from the stack. The
Negative consequence citing "our `docker-compose` Postgres + Redis setup" is
fossilized — there is no docker-compose file and no Redis; local dev runs on
the Supabase CLI stack (`workspace.yml`). The invariant stands (Docker is
still required, for Testcontainers). The decision recorded here is unchanged.
