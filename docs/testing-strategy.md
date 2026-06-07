# Testing strategy

How testing is structured across the Autodidact monorepo. See ADR-025 (mobile
second runner) and ADR-026 (e2e strategy) for the durable decisions.

## The pyramid — one mock seam per layer, real everything else

| Layer | Runner | Infra | LLM | Where |
|-------|--------|-------|-----|-------|
| Unit | Vitest | none | mocked | every package/service `src/__tests__/*.test.ts` |
| Integration | Vitest | real PG + Redis (Testcontainers) | mocked | `*.integration.test.ts`, `@autodidact/test-support` harness |
| API-level e2e | Vitest + supertest | real PG | mocked (auth + LLM) | `services/api/src/__tests__/e2e/` |
| Cross-service e2e | Vitest + child-process services | real PG + Redis + all 3 services | **mock provider** (`*_PROVIDER=mock`) | `@autodidact/e2e` |
| Mobile unit/component | jest-expo + RNTL | none | n/a | `apps/mobile/src/**/__tests__/` |
| Mobile e2e | Maestro | device + backend | mock provider | `apps/mobile/.maestro/` (manual/nightly) |
| Live smoke | Vitest (gated) | real OpenAI | **real** | `packages/providers` (`LIVE_SMOKE=1`, nightly) |

The single shared harness for real Postgres/Redis is `@autodidact/test-support`
(`withTestDatabase`, `withTestRedis`, seed factories). The mock LLM/embedding/auth
providers live in `@autodidact/providers` (`LLM_PROVIDER=mock`, etc.).

## Commands

```bash
pnpm test                 # build + all unit/integration suites (Vitest) + mobile jest
pnpm test <filter>        # one package, e.g. pnpm test api
pnpm test:e2e             # build + unit suites + cross-service golden path (Docker)
pnpm --filter @autodidact/mobile test        # mobile jest only
pnpm --filter <pkg> test:coverage            # coverage for one package
```

Live smoke (nightly only): `LIVE_SMOKE=1 OPENAI_API_KEY=… pnpm --filter @autodidact/providers test`.
Mobile e2e (manual): `cd apps/mobile && maestro test .maestro/` — see `.maestro/README.md`.

## CI

- `ci.yml` — three parallel jobs on every PR/push: `lint-typecheck`, `test`
  (unit + integration + mobile jest; Testcontainers run via the runner's Docker),
  and `e2e` (cross-service golden path).
- `nightly.yml` — scheduled `live-smoke` (real OpenAI, gated by `LIVE_SMOKE`).
  Maestro mobile-e2e is manual until an emulator runner exists.

## Coverage — tiered targets + ratchet

`createBaseConfig()` (`packages/config/vitest.base.ts`) merges per-package
`coverage.thresholds` overrides, so each package can set its own floor without
losing the shared excludes.

Target tiers (the goal):

| Scope | Target |
|-------|--------|
| Services (`services/*`) | 80% |
| Infra packages (`packages/db`, `providers`, `observability`, `test-support`) | 85% |
| Pure packages (`packages/schemas`, `prompts`, `types`, `config`) | 100% |
| Mobile (`apps/mobile`) | 50% |

**Ratchet strategy:** thresholds start at each package's current measured floor
and are raised toward the targets as tests are added — CI fails on regression
below the floor, never letting coverage silently erode. Set a package's floor by
adding `test.coverage.thresholds` (and excluding pure re-export barrels, which
v8 reports as 0%) to its `vitest.config.ts`. Measure with `test:coverage` before
ratcheting a floor upward.
