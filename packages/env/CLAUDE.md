# Subtree Instructions — packages/env/

> These rules apply only within `packages/env/`. They extend the root `CLAUDE.md`.

## Purpose of this subtree

Typed, fail-fast environment validation. Each backend service validates `process.env` against a zod schema **once at boot** and works with a typed object thereafter. Converts silent misconfiguration (empty connection strings, late 401s) into a single explanatory startup error.

---

## Invariants (must not be broken)

- These schemas are the single source of truth for which env vars each service *requires* to boot. `.env.example` documents the same set for humans — keep the two in sync. When a service starts reading a new required var, add it here in the same change.
- **Validate at boot, never at module import.** Export `loadXEnv()` functions that services call as the first statement of `main.ts`. Do not parse `process.env` at top-level module scope — that would run during test imports and before the env is loaded, re-introducing the empty-connection-string trap documented in `packages/db/CLAUDE.md`.
- Every schema export includes its inferred type (`z.infer<typeof Schema>`), matching the `@autodidact/schemas` convention.
- Required-var sets reflect *runtime* truth, not aspiration. `DATABASE_URL` is required for `agent` only when `CHECKPOINTER=postgres` (default is in-memory); `ANTHROPIC_API_KEY` only when `LLM_PROVIDER=anthropic`. Encode such conditions with `superRefine`, don't blanket-require.

---

## Library / tooling rules

- Use: `zod` exclusively (already the repo's validation library via `@autodidact/schemas`).
- Do not: read files, call services, or perform side effects here. This package only validates `process.env`.

---

## Relationship to the provider factory

`packages/providers/factory.ts` keeps reading `process.env['X'] ?? fallback` with its `ProviderConfig` test-injection escape hatch — that pattern is intentionally preserved. `loadXEnv()` is the **boot gate** that guarantees those vars are present and valid *before* any factory or DB query runs; `process.env` remains the transport. Do not rewire the factories to import this package.

---

## Source of truth

- `src/schema.ts` — `apiEnvSchema`, `agentEnvSchema`, `workerEnvSchema` + inferred types.
- `src/load.ts` — `loadApiEnv` / `loadAgentEnv` / `loadWorkerEnv` and `EnvValidationError`.

---

## Verification

- `pnpm test env` — schema + loader unit tests.
- `pnpm typecheck` — type-checks the package and its consumers.
