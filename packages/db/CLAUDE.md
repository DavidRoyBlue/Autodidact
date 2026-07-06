# Subtree Instructions — packages/db/

> These rules apply only within `packages/db/`. They extend the root `CLAUDE.md`.
> Migration authority, workflow, and local-vs-prod connection rules live in `.claude/rules/db.md` (auto-loads for these paths).

## Purpose of this subtree

Drizzle ORM client, schema definitions, database migrations, and the custom pgvector column type. This is the single source of truth for database structure across the monorepo.

---

## Invariants (must not be broken)

- Call `getDb()` at query time, not at module initialization. The pool is constructed when the module is first imported using `process.env['DATABASE_URL']`; if that env var is not yet loaded, the pool silently uses an empty connection string. Always call `getDb()` inside a function body, not at the top level of a module.
- Call `getSupabaseAdmin()` at use time, not at module initialization. The admin client is built lazily from `SUPABASE_URL` / `SUPABASE_SECRET_KEY`; unlike the pg pool, `createClient` throws synchronously on an empty URL, so an eager top-level construction crashes before a service's boot-time env validation (`@autodidact/env`) can report the missing variable. Never call it at the top level of a module.
- pgvector UPDATE statements require `db.execute(sql\`...\`)` with an explicit `::vector` cast. Drizzle's `.set()` does not handle the pgvector parameterization correctly and will produce malformed queries. See the usage example in `packages/db/README.md`.
- `module_progress.chatSessionId` is reserved and not populated by current application code. It is reserved for Phase 2 (linking chat sessions to progress records). Do not read from or write to this column until the feature is built.
- `modules.status` is a blueprint default, not per-user state. Per-user module progress lives in `module_progress.status`. Never use `modules.status` to render a user's current progress.

---

## Library / tooling rules

- Use: `drizzle-orm` for all queries; `drizzle-kit` for migration generation; `pg` (node-postgres) as the underlying driver.
- Use: `db.execute(sql\`...\`)` for any query that involves pgvector casting or complex SQL not expressible through Drizzle's builder.
- Do not use: Prisma, TypeORM, or any other ORM in this package.

---

## Source of truth

- `src/schema/` is the source of truth for all table and column definitions.
- `migrations/` is the source of truth for database state history.
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

---

## Key Decisions

- [ADR-002 — Database platform](../../docs/architecture/ADRs/cross-cutting/ADR-002-database-platform.md) (Supabase Postgres)
- [ADR-008 — ORM / data access layer](../../docs/architecture/ADRs/packages/db/ADR-008-orm-data-access.md) (Drizzle)
- [ADR-010 — Vector search strategy](../../docs/architecture/ADRs/packages/db/ADR-010-vector-search-strategy.md) (pgvector)
