# Subtree Instructions — packages/test-support/

> These rules apply only within `packages/test-support/`. They extend the root `AGENTS.md`.

## Purpose

Real infrastructure harness (Postgres via Testcontainers) and seed factories for integration and e2e tests across the monorepo.

## Invariants (must not be broken)

- This package provides **real** infrastructure, never mocks. Mocks live in `@autodidact/config/test-utils` — do not duplicate them here.
- `withTestDatabase()` MUST apply the `DEV_DB_INIT_SQL` auth/extension stubs (inlined in `src/database.ts`) before migrations; the RLS migrations (`0003`/`0004`) reference `auth.uid()`/`auth.role()` and fail to compile without the stubs. (The Testcontainers Postgres has no Supabase auth schema; the local dev stack uses real GoTrue and needs none of this.) The stub also includes `auth.jwt()` (returns `'{}'::jsonb`) so that the `is_anonymous()` RLS helper in `0007_auth_provisioning` compiles. The stub also includes a minimal `auth.users` table (columns: `id uuid`, `email text`, `is_anonymous boolean`, `raw_user_meta_data jsonb`) so that auth-schema trigger migrations install and are testable by inserting rows directly. The real `auth.users` is GoTrue-managed in the local Supabase stack and prod — it must never be created by a migration file. The stub also creates the Supabase predefined roles `anon`/`authenticated`/`service_role` (NOLOGIN) so migrations that GRANT/REVOKE on them (`0008`, and Plan C's Data API lockdown) resolve — the plain Testcontainers Postgres lacks them. The stub also includes a minimal `auth.identities` table (columns: `id uuid`, `user_id uuid`, `identity_data jsonb`, `provider text`) so that the `handle_identity_linked` trigger migration (`0011`) installs and is testable by inserting identity rows directly.
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
- Auth stubs: `DEV_DB_INIT_SQL` in `src/database.ts` (inlined; the old `docker/dev-db-init.sql` was retired with the Docker dev stack).
