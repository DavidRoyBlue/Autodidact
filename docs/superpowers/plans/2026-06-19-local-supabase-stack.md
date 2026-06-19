# Local Supabase Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move local development from the hand-rolled Docker-Postgres setup to the full Supabase CLI local stack (`supabase start`) so auth (real GoTrue, RLS with real `auth.uid()`) is testable locally.

**Architecture:** `supabase start` provides the local stack (Postgres `:54322`, GoTrue/API `:54321`, Studio `:54323`). Drizzle remains the **sole** schema-migration authority — its existing `packages/db/migrations/` trail is applied *on top of* the running stack; `supabase/` is CLI-tooling only. The Docker `docker-compose.yml` + `docker/dev-db-init.sql` auth stubs are retired.

**Tech Stack:** Supabase CLI (`supabase` devDependency, v2.107.0), Drizzle Kit, pnpm + Turborepo, Bash scripts, Expo (`app.config.ts`).

> **Verification style:** this is infra/scripts work, not unit-testable logic. Each task's "test" is a concrete command with expected output (boot the stack, apply migrations, hit an endpoint, round-trip a real signup). Run every verification command and confirm the expected output before committing.

## Global Constraints

- **Drizzle is the sole migration authority** — all schema/DDL goes through `packages/db/migrations/`. **Never** create `supabase/migrations/`, and **never** run `supabase migration new` / `supabase db diff` / `supabase db push` for app schema. (`packages/db/CLAUDE.md`, commit `fa73ba8`.)
- **`config.toml` `[db] major_version` must equal the remote** — remote is **Postgres 17.6**, so `major_version = 17` (already set; do not change to 16).
- **Local connection is direct on `127.0.0.1:54322`** (no pooler). The port-6543 transaction-pooler invariant applies to **cloud/prod only** (the cloud direct host is IPv6-only/unreachable from WSL2; `127.0.0.1` is reachable directly).
- **Env var names stay `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY`** (matches current `supabase start` output and the codebase) — never `ANON_KEY`/`SERVICE_ROLE_KEY`.
- **`supabase/seed.sql` stays inert** — `[db.seed]` is enabled, so `supabase db reset` auto-runs it before any Drizzle schema exists; real seeding (Specs 3/4) is a post-migrate script step, not this file.
- Invoke the CLI as **`pnpm exec supabase …`**.

---

### Task 1: Stand up the local stack — config baseline, inert seed, env

**Files:**
- Modify: `supabase/config.toml` (auth redirect baseline; confirm `major_version`)
- Create: `supabase/seed.sql`
- Modify: `.env.example`
- (Developer also edits their gitignored `.env.dev` — see steps)

**Interfaces:**
- Produces: a running local stack reachable at DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres` and API `http://127.0.0.1:54321`; the well-known local `SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY` from `supabase status`.

- [ ] **Step 1: Confirm `major_version` matches the remote (no edit expected)**

Open `supabase/config.toml`, find `[db] major_version` (line ~42). It must be `17` (remote is Postgres 17.6). If it is already `17`, make no change.

- [ ] **Step 2: Add the mobile scheme to auth redirects**

In `supabase/config.toml` `[auth]`, replace the `additional_redirect_urls` line:

```toml
additional_redirect_urls = ["https://127.0.0.1:3000", "autodidact://", "exp://127.0.0.1:8081"]
```

(Leave `enable_anonymous_sign_ins`, `enable_confirmations`, rate limits, etc. at their defaults — Spec 2 owns auth tuning.)

- [ ] **Step 3: Create the inert seed file**

Create `supabase/seed.sql`:

```sql
-- Intentionally inert. `supabase db reset` runs this BEFORE Drizzle migrations
-- apply the public schema, so it must not reference app tables.
-- Real seeding runs as a POST-MIGRATE script step:
--   - production onboarding course  → Spec 3 (db:seed:onboarding)
--   - dev test user (test@autodidact.dev) → Spec 4 (db:seed:dev)
-- Do not add app-data INSERTs here.
```

- [ ] **Step 4: Point `.env.example` at the local stack**

In `.env.example`, replace the `LOCAL DATABASE + SUPABASE` block (lines ~24-38) with:

```bash
# ── LOCAL DATABASE + SUPABASE ────────────────────────────────────────────────
# Local dev runs the full Supabase stack via `supabase start` (pnpm dev starts it).
# Connect DIRECT to the local stack — no pooler locally. The port-6543 transaction
# pooler is required only for the CLOUD/prod DATABASE_URL (cloud direct host is
# IPv6-only and unreachable from WSL2; 127.0.0.1 is reachable directly).

DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
# Production / WSL2 pooler example:
# DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-1-[region].pooler.supabase.com:6543/postgres

SUPABASE_URL=http://127.0.0.1:54321

# Run `pnpm exec supabase status` after `supabase start` and copy the two keys here.
SUPABASE_PUBLISHABLE_KEY=
# Secret key — server-side admin client (packages/db) only; never expose to clients
SUPABASE_SECRET_KEY=
```

- [ ] **Step 5: Boot the stack and capture keys**

Run:
```bash
pnpm exec supabase start
pnpm exec supabase status
```
Expected: `supabase start` pulls images on first run (slow once), then prints a status table with `API URL: http://127.0.0.1:54321`, `DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres`, and a `Publishable key: sb_publishable_…` + `Secret key: sb_secret_…`.

Copy the two keys into your local `.env.dev`, and set its `DATABASE_URL` + `SUPABASE_URL` to the local values from Step 4.

- [ ] **Step 6: Verify the DB is reachable and `public` is empty**

Run:
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c '\dt public.*'
```
Expected: `Did not find any relations.` (public schema empty — Drizzle migrations come in Task 2). The `auth` schema exists (real GoTrue): `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c '\dt auth.*'` lists `auth.users`, etc.

- [ ] **Step 7: Commit**

```bash
git add supabase/config.toml supabase/seed.sql .env.example
git commit -m "feat(infra): boot local Supabase stack + inert seed + local env (Spec 1)"
```

---

### Task 2: `migrate.sh` — drop dev-db-init; apply Drizzle migrations on the local stack

**Files:**
- Modify: `scripts/migrate.sh`

**Interfaces:**
- Consumes: `DATABASE_URL` (local `:54322` from Task 1).
- Produces: a fully migrated `public` schema on the local stack.

- [ ] **Step 1: Replace `scripts/migrate.sh` wholesale**

The local stack has a real `auth` schema, so the `dev-db-init.sql` block is obsolete. New content:

```bash
#!/usr/bin/env bash
# Run pending database migrations against the database in DATABASE_URL.
# Works for local (Supabase CLI stack, 127.0.0.1:54322) and production (Supabase pooler).
# Drizzle is the sole migration authority (packages/db/CLAUDE.md).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

CYAN='\033[0;36m'; BOLD='\033[1m'; GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'

step() { echo -e "\n${CYAN}${BOLD}▶ $*${NC}"; }
ok()   { echo -e "${GREEN}✓ $*${NC}"; }
die()  { echo -e "${RED}✗ $*${NC}"; exit 1; }

[[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL is not set in the environment"

step "Running migrations against: ${DATABASE_URL%%@*}@***"
pnpm --filter @autodidact/db db:migrate
ok "All migrations applied"
```

- [ ] **Step 2: Apply migrations to the local stack**

With the stack running (Task 1) and `.env.dev` pointing at `:54322`, run:
```bash
pnpm migrate:dev
```
Expected: drizzle-kit applies `0001`–`0005` with no error.

- [ ] **Step 3: Verify schema + pgvector resolved**

Run:
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c '\dt public.*'
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "\d public.courses" | grep topic_embedding
```
Expected: tables (`courses`, `modules`, `enrollments`, `module_progress`, `module_content_chunks`, …) listed; `topic_embedding | vector(1536)` shown — proving `CREATE EXTENSION vector` resolved via the `[api] extra_search_path = ["public","extensions"]`. (A missing `uuid-ossp` would have surfaced here; migrations use built-in `gen_random_uuid()`, so none is needed.)

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate.sh
git commit -m "feat(infra): migrate.sh applies Drizzle migrations on the local Supabase stack (Spec 1)"
```

---

### Task 3: `dev.sh` + `setup.sh` — boot via `supabase start`

**Files:**
- Modify: `scripts/dev.sh`
- Modify: `scripts/setup.sh`

- [ ] **Step 1: Rewrite the infra section of `scripts/dev.sh`**

Replace the "Docker infra" + "Wait for Postgres" sections (lines 30-45) with a single block (`supabase start` blocks until healthy — no `pg_isready` loop needed). The new file body:

```bash
#!/usr/bin/env bash
# Start the full local backend stack: Supabase stack → build → migrate → all services.
# Run mobile separately with: ./scripts/mobile.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

BOLD='\033[1m'; CYAN='\033[0;36m'; GREEN='\033[0;32m'
YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

step()  { echo -e "\n${CYAN}${BOLD}▶ $*${NC}"; }
ok()    { echo -e "${GREEN}✓ $*${NC}"; }
die()   { echo -e "${RED}✗ $*${NC}"; exit 1; }

step "Pre-flight checks"
[[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL not set. Run: pnpm dev"
command -v docker &>/dev/null || die "docker not found. Install Docker Desktop."
command -v pnpm   &>/dev/null || die "pnpm not found. Run: npm install -g pnpm"
docker info &>/dev/null 2>&1 || die "Docker is not running. Start Docker Desktop."
ok "All pre-flight checks passed"

step "Starting local Supabase stack (first run pulls images)"
pnpm exec supabase start
ok "Supabase stack running (API 54321, DB 54322, Studio 54323)"

step "Building services (API and Worker require compiled output)"
pnpm build
ok "Build complete"

step "Running database migrations"
pnpm migrate:dev
ok "Migrations applied"

step "Starting all backend services"
echo -e "${YELLOW}  API     → http://localhost:3000/v1${NC}"
echo -e "${YELLOW}  Agent   → http://localhost:3001     (internal)${NC}"
echo -e "${YELLOW}  Worker  → http://localhost:3002     (internal task handler)${NC}"
echo
echo -e "${YELLOW}Mobile: open a new terminal and run  ./scripts/mobile.sh${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop services (then 'pnpm stop' to stop the Supabase stack)${NC}\n"

exec "$ROOT/node_modules/.bin/turbo" run dev
```

- [ ] **Step 2: Rewrite the infra + next-steps sections of `scripts/setup.sh`**

Replace the "Docker infra" + "Wait for Postgres" sections (lines 64-79) with:

```bash
# ── Local Supabase stack ───────────────────────────────────────────────────────
step "Starting the local Supabase stack (first run pulls images, ~minutes)"
pnpm exec supabase start
ok "Supabase stack running"
```

And replace the final "Next steps" block (lines 100-109) with:

```bash
echo "Next steps:"
info "1. Run 'pnpm exec supabase status' and copy Publishable + Secret keys into .env.dev"
info "2. Fill in OPENAI_API_KEY in .env.dev"
info "3. Create .env.prod manually when you need production database access"
info ""
info "Then start the app:"
info "  pnpm dev               ← backend services (+ Supabase stack)"
info "  pnpm mobile            ← mobile app (separate terminal)"
```

(The migrate step at line 83 already runs via the `dotenv -e .env.dev` wrapper — leave it. Remove nothing else.)

- [ ] **Step 3: Verify `pnpm dev` boots end-to-end**

Run (Ctrl+C after confirming services start):
```bash
pnpm dev
```
In another terminal:
```bash
curl -s http://localhost:3000/health
```
Expected: the stack starts, migrations apply, services boot, and `/health` (the unguarded endpoint) returns a 200/health JSON.

- [ ] **Step 4: Commit**

```bash
git add scripts/dev.sh scripts/setup.sh
git commit -m "feat(infra): dev.sh and setup.sh boot the Supabase stack via supabase start (Spec 1)"
```

---

### Task 4: `db-reset.sh` + `stop.sh` + Studio note

**Files:**
- Modify: `scripts/db-reset.sh`
- Modify: `scripts/stop.sh`
- Modify: `scripts/db-studio.sh`

- [ ] **Step 1: Rewrite `scripts/db-reset.sh`**

`supabase db reset` resets the local DB to the clean Supabase baseline (empty `public`; auto-runs the inert `seed.sql`); then Drizzle migrate applies the schema. Keep the localhost-only guard + confirm prompt. New content:

```bash
#!/usr/bin/env bash
# DESTRUCTIVE: resets the local Supabase stack DB to a clean baseline, then re-applies
# all Drizzle migrations. Only works against the local stack. NEVER runs against prod.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

BOLD='\033[1m'; CYAN='\033[0;36m'; GREEN='\033[0;32m'
YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

step()  { echo -e "\n${CYAN}${BOLD}▶ $*${NC}"; }
ok()    { echo -e "${GREEN}✓ $*${NC}"; }
die()   { echo -e "${RED}✗ $*${NC}"; exit 1; }

DB_URL="${DATABASE_URL:-}"
[[ -n "$DB_URL" ]] || die "DATABASE_URL not set. Run: pnpm db:reset:dev"
if [[ "$DB_URL" != *"127.0.0.1"* ]] && [[ "$DB_URL" != *"localhost"* ]]; then
  die "db-reset only works against the local stack.\nDetected: $DB_URL\nAborting to protect production data."
fi

echo -e "${RED}${BOLD}WARNING: This will delete ALL local database data.${NC}"
echo -e "Database: ${YELLOW}$DB_URL${NC}"
read -rp "Type 'yes' to confirm: " CONFIRM
[[ "$CONFIRM" == "yes" ]] || { echo "Aborted."; exit 0; }

step "Resetting local Supabase database to clean baseline"
pnpm exec supabase db reset
ok "Database reset (clean baseline; inert seed.sql ran)"

step "Applying Drizzle migrations"
"$SCRIPT_DIR/migrate.sh"
ok "Migrations applied"

echo -e "\n${GREEN}${BOLD}Local database reset complete.${NC}"
```

- [ ] **Step 2: Rewrite `scripts/stop.sh`**

Replace the body's stop section:

```bash
step "Stopping the local Supabase stack"
pnpm exec supabase stop
ok "Supabase stack stopped"

echo
echo -e "${YELLOW}Note: local DB data is preserved. To wipe it: pnpm exec supabase stop --no-backup${NC}"
```

(Keep the script header/colors/helpers; just swap `docker compose down` for the above.)

- [ ] **Step 3: Add a Supabase Studio hint to `scripts/db-studio.sh`**

After the existing `echo -e "${YELLOW}  Opens at https://local.drizzle.studio${NC}"` line, add:

```bash
echo -e "${YELLOW}  (Supabase Studio is also available at http://127.0.0.1:54323 when the stack is up)${NC}"
```

- [ ] **Step 4: Verify reset + stop**

Run:
```bash
pnpm db:reset:dev   # type 'yes'
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c '\dt public.*'   # tables present again
pnpm stop
pnpm exec supabase status   # expected: reports the stack is not running
```

- [ ] **Step 5: Commit**

```bash
git add scripts/db-reset.sh scripts/stop.sh scripts/db-studio.sh
git commit -m "feat(infra): db-reset/stop/studio scripts use the Supabase CLI stack (Spec 1)"
```

---

### Task 5: Remove the retired Docker infra

**Files:**
- Delete: `docker-compose.yml`
- Delete: `docker/dev-db-init.sql`

- [ ] **Step 1: Confirm nothing references them anymore**

Run:
```bash
grep -rn "docker compose\|docker-compose\|dev-db-init" scripts/ package.json
```
Expected: no matches (Tasks 2-4 removed every reference). If any remain, fix them before deleting.

- [ ] **Step 2: Delete the files**

```bash
git rm docker-compose.yml docker/dev-db-init.sql
```

- [ ] **Step 3: Verify the full path still works**

```bash
pnpm stop || true
pnpm dev   # boots Supabase stack, migrates, starts services — Ctrl+C after confirming
```
Expected: no error about a missing `docker-compose.yml` or `dev-db-init.sql`.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(infra): remove Docker Postgres compose + dev-db-init auth stubs (Spec 1)"
```

---

### Task 6: Mobile → local Supabase (env-driven, emulator-reachable)

**Files:**
- Modify: `apps/mobile/app.config.ts`
- Modify: `apps/mobile/package.json` (add `dotenv` devDependency)
- Modify: `scripts/run-mobile.sh` (add `adb reverse tcp:54321`)
- Modify: `scripts/mobile.sh` (drop the stale app.json `supabaseUrl` check)
- Modify: `.env.example` (note the shared publishable key for mobile)

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` from root `.env.dev`.
- Produces: `extra.supabaseUrl` / `extra.supabasePublishableKey` resolved to the local stack in dev (mobile already reads `extra` via `expo-constants`).

- [ ] **Step 1: Make `app.config.ts` env-driven (self-loads root `.env.dev`)**

`run-mobile.sh`/`mobile.sh` start Expo without a `dotenv` wrapper, so `app.config.ts` loads the root env itself (guarded; a no-op in EAS/CI where the file is absent). Replace `apps/mobile/app.config.ts` with:

```typescript
import type { ConfigContext, ExpoConfig } from 'expo/config';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

// Dev only: load the monorepo-root .env.dev so SUPABASE_URL / keys reach this
// config at resolution time. Missing file (EAS/CI) is a silent no-op.
loadEnv({ path: path.resolve(__dirname, '../../.env.dev') });

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'Autodidact',
  slug: config.slug ?? 'autodidact',
  extra: {
    ...config.extra,
    apiBaseUrl:
      process.env.AUTODIDACT_API_BASE_URL ??
      (config.extra?.apiBaseUrl as string | undefined) ??
      'http://localhost:3000/v1',
    supabaseUrl:
      process.env.SUPABASE_URL ??
      (config.extra?.supabaseUrl as string | undefined),
    supabasePublishableKey:
      process.env.SUPABASE_PUBLISHABLE_KEY ??
      (config.extra?.supabasePublishableKey as string | undefined),
  },
});
```

- [ ] **Step 2: Add `dotenv` to mobile devDependencies**

```bash
pnpm --filter @autodidact/mobile add -D dotenv
```
Expected: `apps/mobile/package.json` gains `dotenv` under devDependencies.

- [ ] **Step 3: Reverse the Supabase port to the emulator**

In `scripts/run-mobile.sh` step 4, after the existing `reverse tcp:8081 tcp:8081` line (line ~80), add Supabase + API reverses so the emulator reaches them on `127.0.0.1`:

```bash
    timeout 10 "$LINUX_ADB" -s "$serial" reverse tcp:54321 tcp:54321 >/dev/null 2>&1 || true
    timeout 10 "$LINUX_ADB" -s "$serial" reverse tcp:3000 tcp:3000 >/dev/null 2>&1 || true
```

- [ ] **Step 4: Drop the stale app.json check in `scripts/mobile.sh`**

Remove the `SUPABASE_URL=$(node -e …)` block and its `if [[ -z "$SUPABASE_URL" ]]` warning (lines 16-27) — `supabaseUrl` now comes from env via `app.config.ts`, not `app.json`. Leave the rest of the script unchanged.

- [ ] **Step 5: Note the shared key in `.env.example`**

Under the `SUPABASE_PUBLISHABLE_KEY=` line added in Task 1, add a comment:

```bash
# (also read by the mobile app via app.config.ts for local-stack auth)
```

- [ ] **Step 6: Verify the config resolves to the local stack**

With `.env.dev` populated and the stack up:
```bash
cd apps/mobile && pnpm exec expo config --json | grep -A1 '"supabaseUrl"'
```
Expected: `"supabaseUrl": "http://127.0.0.1:54321"` and `supabasePublishableKey` = your `sb_publishable_…`.

- [ ] **Step 7: Verify a real local signup round-trips through local GoTrue**

Boot backend (`pnpm dev`) + app (`pnpm mobile:run`), sign up a test email in the app, then:
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select email from auth.users;"
```
Expected: the email you just registered appears in **local** `auth.users` (proving the app hit the local stack, not the cloud project). The confirmation email (if enabled later) is viewable at Inbucket `http://127.0.0.1:54324`.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/app.config.ts apps/mobile/package.json scripts/run-mobile.sh scripts/mobile.sh .env.example pnpm-lock.yaml
git commit -m "feat(mobile): resolve Supabase URL/key from env for the local stack in dev (Spec 1)"
```

---

### Task 7: Docs + cross-links

**Files:**
- Modify: `README.md` (root — commands table)
- Modify: `CLAUDE.md` (root — Commands section)
- Modify: `packages/db/CLAUDE.md` (local-stack pooler exemption note)
- Modify: `apps/mobile/README.md` (local Supabase URL + adb reverse)

- [ ] **Step 1: Update the root command docs**

In `CLAUDE.md` and `README.md`, update the commands so they describe the Supabase stack rather than Docker Postgres: `pnpm setup`/`pnpm dev` now "start the local Supabase stack (`supabase start`) → migrate → services"; `pnpm stop` "stops the Supabase stack (`supabase stop`)"; `pnpm db:reset:dev` "`supabase db reset` → re-apply Drizzle migrations". Note Supabase Studio at `http://127.0.0.1:54323` alongside Drizzle Studio.

- [ ] **Step 2: Document the local pooler exemption in `packages/db/CLAUDE.md`**

After the existing WSL2 pooler invariant line, add:

```markdown
- **Local-stack exemption:** the port-6543 pooler requirement applies to the **cloud/prod** `DATABASE_URL` only. Local dev uses the Supabase CLI stack on `127.0.0.1:54322` (direct, no pooler) — reachable from WSL2, so the IPv6 problem does not apply.
```

- [ ] **Step 3: Document mobile→local-stack networking in `apps/mobile/README.md`**

Add a short note: in dev, `app.config.ts` resolves `extra.supabaseUrl`/`supabasePublishableKey` from the root `.env.dev`; the emulator reaches the local stack via `adb reverse tcp:54321` (added in `run-mobile.sh`), so the URL is `http://127.0.0.1:54321` (not `10.0.2.2`).

- [ ] **Step 4: Verify no stale references remain in docs**

```bash
grep -rn "docker compose\|dev-db-init\|localhost:5432" README.md CLAUDE.md apps/mobile/README.md packages/db/CLAUDE.md
```
Expected: no matches (or only historical/intentional ones you've confirmed).

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md packages/db/CLAUDE.md apps/mobile/README.md
git commit -m "docs(infra): document the local Supabase stack workflow + pooler exemption (Spec 1)"
```

---

## Verification (end-to-end)

After all tasks, a clean run from scratch should work:

```bash
pnpm stop || true
pnpm exec supabase stop --no-backup || true   # clean slate
pnpm dev                                        # stack → migrate → services (Ctrl+C after boot)
# new terminal:
curl -s http://localhost:3000/health            # 200
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c '\dt public.*'   # tables present
pnpm mobile:run                                 # app on emulator
# sign up in the app, then:
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c 'select email, is_anonymous from auth.users;'  # the new user is in LOCAL GoTrue
pnpm db:reset:dev                               # reset works (type 'yes')
pnpm stop                                        # stack stops
```

**Done when:** the stack boots via `supabase start`, all Drizzle migrations apply on `:54322`, backend + mobile run against the local stack, a real signup lands in local `auth.users`, and `docker-compose.yml` + `docker/dev-db-init.sql` are gone with no remaining references.
