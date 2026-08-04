# Subtree Instructions — e2e/

> These rules apply only within `e2e/`. They extend the root `AGENTS.md`.
> Human-facing narrative lives in [README.md](./README.md).

## Purpose of this subtree

`@autodidact/e2e` is the **cross-service** end-to-end layer (ADR-026). It boots
the real `api`, `agent`, and `worker` services as child processes against a
Testcontainers Postgres and drives full user journeys over real HTTP / SSE /
loopback task dispatch (the same `/tasks/:name` contract Cloud Tasks uses in
production). It is the highest-fidelity layer in the test pyramid.

This package is **test-only**: it has no build output, exports nothing, and is
never imported by application code.

---

## Invariants (must not be broken)

- **One mock seam: the model (plus auth).** Services run with `LLM_PROVIDER=mock`,
  `EMBEDDING_PROVIDER=mock`, and `AUTH_PROVIDER=mock` (we can't mint Supabase
  JWTs). Everything else is real — real HTTP between api↔agent, the real worker
  receiving task POSTs over the loopback provider (`QUEUE_PROVIDER=loopback`),
  real Postgres, real LangGraph graphs, real SSE. Do not stub api, agent, or
  worker internals.
- **Auth token shape:** the mock auth provider accepts `Bearer test-<userId>`.
  Seed the user row first so its id matches the token and FK columns resolve.
- **Services must be built first.** The harness spawns `services/<svc>/dist/main.js`.
  Run `pnpm build` (or rely on turbo `test:e2e` → `^build`) before running. The
  harness throws a clear error if a `dist/main.js` is missing.
- **Assert real DB state** for each transition (course `ready`, module_progress
  rows, unlock) via `harness.db` / `harness.pool` — not just HTTP status codes.

---

## Verification commands

```bash
pnpm build                              # build all services + packages first
pnpm --filter @autodidact/e2e test:e2e  # run the cross-service journeys
pnpm --filter @autodidact/e2e typecheck
```

Requires Docker (Testcontainers). The normal `pnpm test` gate does NOT run this
package — it has no `test` script; use `test:e2e`.

---

## Source of truth

- Harness lifecycle and service env: `src/harness.ts`
- Mock providers: `@autodidact/providers` (`*=mock`), documented in its README

## Key Decisions

- [ADR-026 — E2E testing strategy](../docs/architecture/ADRs/cross-cutting/ADR-026-e2e-testing-strategy.md)
