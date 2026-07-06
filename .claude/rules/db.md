---
paths:
  - "packages/db/**"
  - "supabase/**"
  - "**/drizzle.config.*"
---

# Database & migration rules

## Migration authority

- **Drizzle is the sole migration authority.** All schema changes go through `packages/db/migrations/`. The `supabase/` directory is for Supabase CLI tooling only (local dev stack, edge functions, type generation, auth/RLS config, remote linking). Never run `supabase migration new` or `supabase db diff` — the Supabase CLI must not own a parallel `supabase/migrations/` trail.
- **Schema changes require a migration file.** Never change a file in `packages/db/src/schema/` without a corresponding `.sql` in `packages/db/migrations/` committed together. Never manually edit an applied migration file.
- **Known tooling limitation:** `pnpm db:generate:dev` is currently broken (ESM / drizzle-kit `.js`→`.ts` resolution under `"type":"module"`), and the drizzle snapshot chain (`migrations/meta/*_snapshot.json`) is incomplete for hand-authored SQL migrations. Until both are repaired together, **hand-author migrations as plain SQL** (see the trigger migrations in `migrations/` for the pattern).
- Do not use `drizzle push` — all schema changes go through plain SQL migration files.

## Prod policy

- CI applies migrations automatically on deploy (`.github/workflows/deploy.yml`). Manual `pnpm migrate:prod` (loads `infra/secrets.env`, targets the pooler) is for out-of-band inspection/recovery only.
- Prod DB operations and Supabase MCP tools go through the `db-specialist` subagent, never the main conversation.

The step-by-step schema-change procedure and its definition of done live in the `db-migration` skill — this rule owns invariants only.

## Local vs prod connections

- **Cloud/prod `DATABASE_URL`:** must be the Supabase transaction-mode pooler URL (port 6543, `aws-1-<region>.pooler.supabase.com`). The direct host (`db.<ref>.supabase.co:5432`) is IPv6-only and unreachable from WSL2.
- **Local dev:** the Supabase CLI stack on `127.0.0.1:55322` (direct, no pooler) — the IPv6/pooler requirement does not apply.
