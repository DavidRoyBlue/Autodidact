# Subtree Instructions — packages/db/

> These rules apply only within `packages/db/`. They extend the root `CLAUDE.md`.

## Purpose of this subtree

Drizzle ORM client, schema definitions, database migrations, and the custom pgvector column type. This is the single source of truth for database structure across the monorepo.

---

## Invariants (must not be broken)

- Call `getDb()` at query time, not at module initialization. The pool is constructed when the module is first imported using `process.env['DATABASE_URL']`; if that env var is not yet loaded, the pool silently uses an empty connection string. Always call `getDb()` inside a function body, not at the top level of a module.
- Call `getSupabaseAdmin()` at use time, not at module initialization. The admin client is built lazily from `SUPABASE_URL` / `SUPABASE_SECRET_KEY`; unlike the pg pool, `createClient` throws synchronously on an empty URL, so an eager top-level construction crashes before a service's boot-time env validation (`@autodidact/env`) can report the missing variable. Never call it at the top level of a module.
- pgvector UPDATE statements require `db.execute(sql\`...\`)` with an explicit `::vector` cast. Drizzle's `.set()` does not handle the pgvector parameterization correctly and will produce malformed queries. See the usage example in `packages/db/README.md`.
- Schema changes require a migration file. Never change a schema file without a corresponding `.sql` in `migrations/`. Generate with `pnpm db:generate:dev`, review the output SQL, then commit both together.
- Drizzle is the sole migration authority — all schema changes go through `packages/db/migrations/`. The `supabase/` directory at the repo root is for Supabase CLI tooling only (local dev stack, edge functions, type generation, auth/RLS config, remote linking). Never run `supabase migration new` or `supabase db diff`; the Supabase CLI must not own a parallel `supabase/migrations/` trail.
- WSL2 requires the Supabase transaction-mode pooler URL (port 6543). The Supabase direct host (`db.<ref>.supabase.co:5432`) is IPv6-only and unreachable from WSL2. Set `DATABASE_URL` to the transaction pooler URL (`aws-1-<region>.pooler.supabase.com:6543`).
- **Local-stack exemption:** the port-6543 pooler requirement applies to the **cloud/prod** `DATABASE_URL` only. Local dev uses the Supabase CLI stack on `127.0.0.1:55322` (direct, no pooler) — reachable from WSL2, so the IPv6 problem does not apply.
- **Prod migrations:** apply with `pnpm migrate:prod` (loads `infra/secrets.env`, targets the pooler). CI also runs migrations automatically on deploy (`.github/workflows/deploy.yml`), so manual runs are for out-of-band inspection/recovery only.
- `module_progress.chatSessionId` is reserved and not populated by current application code. It is reserved for Phase 2 (linking chat sessions to progress records). Do not read from or write to this column until the feature is built.
- `modules.status` is a blueprint default, not per-user state. Per-user module progress lives in `module_progress.status`. Never use `modules.status` to render a user's current progress.

---

## Library / tooling rules

- Use: `drizzle-orm` for all queries; `drizzle-kit` for migration generation; `pg` (node-postgres) as the underlying driver.
- Use: `db.execute(sql\`...\`)` for any query that involves pgvector casting or complex SQL not expressible through Drizzle's builder.
- Do not use: Prisma, TypeORM, or any other ORM in this package.
- Do not use: `drizzle push` — all schema changes go through plain SQL migration files.
- **Known tooling limitation:** `db:generate:dev` is currently broken (ESM / drizzle-kit `.js`→`.ts` resolution under `"type":"module"`), and the drizzle snapshot chain (`migrations/meta/*_snapshot.json`) is incomplete for hand-authored SQL migrations. Until both are repaired together (a dedicated follow-up), author schema migrations as hand-written SQL (see the trigger migrations in `migrations/`) rather than relying on `db:generate`.

---

## Source of truth

- `src/schema/` is the source of truth for all table and column definitions.
- `migrations/` is the source of truth for database state history — never manually edit applied migration files.
- `src/vector.ts` is the source of truth for how pgvector values are serialized/deserialized.
- `SUPABASE_SECRET_KEY` (not `SERVICE_ROLE_KEY`) is the env var name for the admin client in `src/supabase.ts`.

---

## Key patterns to follow

- Import Drizzle query helpers (`eq`, `and`, `sql`, etc.) from `@autodidact/db`, which re-exports them from `drizzle-orm`. Do not add a direct `drizzle-orm` import in service code when `@autodidact/db` already re-exports what you need.
- Use `getDb()`, `getPool()`, and `getSupabaseAdmin()` rather than importing eager singletons directly — this makes the lazy initialization point explicit.
- Vector columns (currently `courses.topicEmbedding`, 1536 dimensions for `text-embedding-3-small`) use the custom `vector()` column type from `src/vector.ts`.

---

## Anti-patterns to avoid

- Do not initialize `getDb()` at the top level of a service module — it runs before env vars are loaded.
- Do not write raw `pg` queries in services for things Drizzle can express cleanly.
- Do not add new columns to schema files without a corresponding migration — the migration is the deploy artifact.

---

## Key Decisions

- [ADR-002 — Database platform](../../docs/architecture/ADRs/cross-cutting/ADR-002-database-platform.md) (Supabase Postgres)
- [ADR-008 — ORM / data access layer](../../docs/architecture/ADRs/packages/db/ADR-008-orm-data-access.md) (Drizzle)
- [ADR-010 — Vector search strategy](../../docs/architecture/ADRs/packages/db/ADR-010-vector-search-strategy.md) (pgvector)
