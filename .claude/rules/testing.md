---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.test.mjs"
  - "**/__tests__/**"
  - "**/vitest.config.*"
  - "**/jest.config.*"
  - "packages/test-support/**"
---

# Testing conventions (cross-cutting)

- **Runner split (ADR-025):** Vitest everywhere, except `apps/mobile` which uses Jest (jest-expo + `@testing-library/react-native`) — the only Jest package in the monorepo. Never introduce a second runner into a package.
- **Real Postgres for integration tests** comes from `@autodidact/test-support` (Testcontainers harness). Do not hand-roll DB containers, docker-compose test setups, or in-memory DB fakes.
- Tests live in `src/__tests__/*.test.ts` next to the code they cover; cross-service e2e lives in the root `e2e/` package.
- Run scoped: `pnpm test <filter>` (e.g. `pnpm test api`) or `pnpm --filter <pkg> test`. `pnpm test` with no filter builds first and runs everything.
- Mock at the seam, not the internals: auth provider, queue provider, and the Agent HTTP client are the sanctioned mock points in backend tests; the LLM is never called in CI.
- Service-specific testing rules (what each e2e mocks, config quirks) live in that service's `CLAUDE.md` — read it before adding tests there.
