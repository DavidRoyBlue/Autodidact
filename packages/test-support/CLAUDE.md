# Subtree Instructions — packages/test-support/

> These rules apply only within `packages/test-support/`. They extend the root `CLAUDE.md`.

## Purpose

Real infrastructure harness (Postgres + Redis via Testcontainers) and seed factories for integration and e2e tests across the monorepo.

## Invariants (must not be broken)

- This package provides **real** infrastructure, never mocks. Mocks live in `@autodidact/config/test-utils` — do not duplicate them here.
- `withTestDatabase()` MUST apply `docker/dev-db-init.sql` before migrations; the RLS migrations (`0003`/`0004`) reference `auth.uid()`/`auth.role()` and fail to compile without the stubs.
- `withTestDatabase()` applies **all** migrations, not a subset — index and RLS coverage is the point.
- Keep `TRUNCATE_TABLES` in `src/database.ts` in sync with `packages/db/src/schema` when tables are added.
- Seed factories take an explicit `db` argument; they must not depend on `getDb()` or any `vi.mock` state.

## Verification

```bash
pnpm --filter @autodidact/test-support test       # harness self-tests (boots containers)
pnpm --filter @autodidact/test-support typecheck
pnpm --filter @autodidact/test-support lint
```

## Source of truth

- DB schema / migrations: `@autodidact/db` (this package only consumes them).
- Auth stubs: `docker/dev-db-init.sql`.
