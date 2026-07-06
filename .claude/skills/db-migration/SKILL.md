---
name: db-migration
description: Use for any database schema change — adding/altering tables, columns, indexes, or triggers, editing packages/db/src/schema, authoring migration SQL, or applying migrations to the local stack or prod. Triggers on "schema change", "add a column/table", "write a migration", "migrate the database".
---

# DB migration

## Overview

Takes a schema change from Drizzle schema edit to verified migration. Binding invariants (Drizzle sole authority, hand-authored SQL while `db:generate:dev` is broken, local-vs-prod connection rules) live in `.claude/rules/db.md` and auto-load when you touch these paths — this skill is the procedure on top of them.

## When to use

- Any edit under `packages/db/src/schema/` or `packages/db/migrations/`
- "Add a field to X", "we need a new table for Y", "index this query"
- Applying or troubleshooting migrations (local stack or prod)

## When NOT to use

- Query-only changes (no DDL) — normal code change
- Supabase auth/RLS/config changes via the `supabase/` directory (CLI tooling scope, not Drizzle)

## Workflow

1. **Classify the change.** If it drops/renames a column or table, truncates, or narrows a type — anything that can lose data — **stop and get explicit confirmation from the user before writing the migration.** State what data is at risk.
2. Edit `packages/db/src/schema/` and hand-author the matching `.sql` in `packages/db/migrations/` (next sequence number, style of the existing trigger migrations). Commit both together.
3. Dry-run locally: `pnpm migrate:dev` against the local stack. For a from-scratch validation, `pnpm db:reset:dev` (destructive, local only) then `pnpm migrate:dev`.
4. Verify types compile against the new schema: `pnpm --filter @autodidact/db typecheck`, then typecheck/test the packages that consume the changed tables.
5. Prod: do **not** apply manually — CI migrates on deploy. `pnpm migrate:prod` only for out-of-band recovery, and only when asked.
6. If the change alters what the system can do (new capability, new blocker), update `PROJECT_STATE.md`.

## Definition of done

- [ ] Dry-run passed: `pnpm migrate:dev` applied cleanly on the local stack
- [ ] Types check: `@autodidact/db` and consuming packages typecheck green
- [ ] Schema file and migration `.sql` are in the same commit
- [ ] No destructive change without the user's explicit confirmation
- [ ] Affected package tests pass
- [ ] `PROJECT_STATE.md` updated if the system's state/capability changed
