# Scripts

All scripts are run from the **monorepo root**:

```bash
./scripts/<name>.sh [options]
```

---

## Quick start

```bash
./scripts/setup.sh   # one-time: install deps, create .env.dev, migrate DB
pnpm dev             # every time: load .env.dev and start all backend services
./scripts/mobile.sh  # in a separate terminal: start the Expo dev server
```

---

## Script reference

### `setup.sh`
**First-time project setup.** Run once after cloning.

Checks prerequisites (Node ≥ 20, pnpm ≥ 9, Docker), installs all dependencies, creates `.env.dev` from `.env.example`, starts Docker infra, waits for Postgres, runs migrations, and builds all packages.

Does **not** start the dev servers — run `pnpm dev` after completing `.env.dev`.

---

### `pnpm dev`
**Start the full local backend stack.** The main command you'll use every day.

Loads `.env.dev` via `dotenv-cli`, verifies required env vars and Docker, starts Postgres via `docker compose up -d`, waits for Postgres readiness, builds all packages (API and Worker require compiled output), runs pending migrations, then launches all backend services (API on `:3000`, Agent on `:3001`, Worker on `:3002`).

Press `Ctrl+C` to stop all services. Start mobile separately with `mobile.sh`.

---

### `mobile.sh`
**Start the Expo mobile dev server.** Run in a separate terminal alongside `pnpm dev`.

Warns if `apps/mobile/app.json` extra fields are empty. Opens the Expo CLI — scan the QR code with Expo Go, or press `i`/`a` for iOS Simulator / Android Emulator.

Requires the backend to be running (`pnpm dev`) for API calls to work.

---

### `emulator.sh`  (`pnpm emulator`)
**Boot the Android emulator on the Windows host and make it visible to WSL2 adb.**

WSL2-specific. Ensures the Windows adb server owns `:5037`, launches the AVD
(default `Medium_Phone`, override with `AVD=…`) detached on Windows, and waits
until it registers and finishes booting. Idempotent — re-running while the AVD is
already booted exits immediately. Self-heals the common "stray Linux adb server"
failure. See `apps/mobile/README.md` → "Running on the Android emulator (WSL2)".

---

### `run-mobile.sh`  (`pnpm mobile:run`)
**Run the app end-to-end on the emulator.** Boots the emulator (via `emulator.sh`),
then starts Expo/Metro and opens the app in Expo Go, leaving Metro running in the
background (log: `.expo-dev.log`). Does **not** start the backend — run `pnpm dev`
separately for working auth/API.

---

### `stop.sh`
**Stop local Docker infrastructure** (Postgres).

Backend service processes (started by `pnpm dev`) are stopped with `Ctrl+C` in that terminal. Data volumes are preserved between stops. To also wipe all local data: `docker compose down -v`.

---

### `migrate.sh`
**Run pending database migrations** against `DATABASE_URL`.

Works for both local Docker Postgres and production Supabase. `DATABASE_URL` must already be set in the environment by a root wrapper such as `pnpm migrate:dev` or `pnpm migrate:prod`.

---

### `db-reset.sh`
**DESTRUCTIVE — wipe and recreate the local database.**

Drops and recreates the `autodidact` database in local Docker Postgres, re-installs extensions (`vector`, `uuid-ossp`), and re-runs all migrations from scratch. Safety check prevents running against non-localhost URLs. Requires confirmation before proceeding.

Use this when migrations are in an inconsistent state or you want a clean slate.

---

### `db-studio.sh`
**Open Drizzle Studio** — a browser-based GUI for the local database.

Launches the Drizzle ORM visual editor at `https://local.drizzle.studio`. Useful for inspecting table contents, running ad-hoc queries, and checking migration results without needing a SQL client. `DATABASE_URL` must already be set in the environment by a root wrapper such as `pnpm db:studio:dev` or `pnpm db:studio:prod`.

---

### `gen-migration.sh`
**Generate a new Drizzle migration** after editing schema files.

Run this after modifying any file in `packages/db/src/schema/`. Drizzle Kit diffs the current schema against the last migration snapshot and generates a new `.sql` file in `packages/db/migrations/`. Always review the generated SQL before committing — then apply it with `pnpm migrate:dev`.

---

### `test.sh`
**Run the test suite.**

With no arguments: builds all packages, then runs all 215 tests across all packages and services.

With a filter: runs tests only for matching packages (e.g. `./scripts/test.sh api`).

Extra flags are passed to vitest (e.g. `./scripts/test.sh --coverage`, `./scripts/test.sh api --watch`).

---

### `typecheck.sh`
**Run TypeScript type-checking** across all packages and services.

Builds packages first (required because some packages depend on compiled output from others), then runs `tsc --noEmit` via Turborepo across the entire workspace. No files are emitted — this is a pure validation pass. Useful before opening a PR.

---

### `lint.sh`
**Run ESLint** across all packages and services.

Pass `--fix` to auto-fix violations: `./scripts/lint.sh --fix`.
