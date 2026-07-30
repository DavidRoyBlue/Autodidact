# Scripts

All scripts are run from the **monorepo root**:

```bash
./scripts/<name>.sh [options]
```

---

## Quick start

```bash
./scripts/setup.sh   # one-time: install deps, create .env.dev, migrate DB
pnpm workspace       # every time: full tmux workspace (Supabase + backend + mobile)
```

Or run the pieces manually in separate terminals: `pnpm dev` (backend stack) and `./scripts/mobile.sh` (Expo).

---

## Script reference

### `dev-workspace.sh`  (`pnpm workspace`)
**Create, repair, and attach to the persistent dev workspace.** Idempotent — run it any time; it never duplicates sessions, panes, processes, or ports.

Reads `workspace.yml` (the source of truth), starts the Supabase stack if it isn't running, then ensures the `autodidact` tmux session has:

| Window   | Pane      | Command        | Health check                          |
|----------|-----------|----------------|---------------------------------------|
| `app`    | `backend` | `pnpm dev`     | port `3000` owned by pane's process   |
| `app`    | `mobile`  | `pnpm mobile`  | port `8081` owned by pane's process   |
| `app`    | `shell`   | — (free term.) | none — created once, never written to |
| `claude` | —         | — (preserved)  | never touched by the script           |

The `claude` window is seeded with 4 tiled panes the first time it is created (`panes_on_create`), then handed off — later runs never re-seed or rearrange it, however you have since split or resized it.

**Service detection.** Managed panes are tagged with the tmux pane option `@ws_id` (stable across pane-index changes). A pane is healthy when a process in its tree matches the pane's `match` regex **and** owns its health port. A pane sitting at a bare shell is restarted; a pane running an unexpected process is warned about, never killed. A pane with no `cmd` (the `shell` free terminal) is only ever created — whatever you run in it is never inspected or restarted. If a health port is held by a process outside the workspace, the script reports the conflict and does **not** start the service on an alternate port.

**Common operations:**

```bash
pnpm workspace                                  # create / repair / attach
./scripts/dev-workspace.sh --no-attach          # repair only (agents, scripts)
./scripts/dev-workspace.sh --check              # validate workspace.yml + tools, change nothing
tmux attach -t autodidact                       # attach later
tmux list-windows -t autodidact                 # what windows exist
tmux list-panes -a -F '#S:#W.#P #{@ws_id} #{pane_current_command}'
tmux capture-pane -pt autodidact:app.1          # inspect a pane's output (index from list-panes)
docker ps --filter name=supabase                # infra containers
```

Caveats: the script assumes it owns the `autodidact` tmux session — don't reuse that name for unrelated work. On WSL2, ports held by Windows-side processes are invisible to `ss`, so conflict detection only sees Linux-side listeners.

**Restart one service:** press `Ctrl+C` in its pane (or `tmux send-keys -t autodidact:app.<pane> C-c`), then re-run `pnpm workspace` — only the dead service is relaunched, in the same pane.

**Stop safely:** `Ctrl+C` in the service panes, `pnpm stop` for the Supabase stack, `tmux kill-session -t autodidact` to drop the session. DB data persists in Docker volumes across `pnpm stop`, tmux exits, and reboots (wipe with `pnpm exec supabase stop --no-backup`). tmux panes/processes do **not** survive a reboot — recover with `pnpm workspace`.

---

### `setup.sh`
**First-time project setup.** Run once after cloning.

Checks prerequisites (Node ≥ 20, pnpm ≥ 9, Docker), installs all dependencies, creates `.env.dev` from `.env.example`, starts the local Supabase stack (`supabase start`), runs migrations, and builds all packages.

Does **not** start the dev servers — run `pnpm dev` after completing `.env.dev`.

---

### `pnpm dev`
**Start the full local backend stack.** The main command you'll use every day.

Loads `.env.dev` via `dotenv-cli`, verifies required env vars and Docker, starts the local Supabase stack via `supabase start` (API `:55321`, DB `:55322`, Studio `:55323`), builds all packages (API and Worker require compiled output), runs pending migrations, then launches all backend services (API on `:3000`, Agent on `:3001`, Worker on `:3002`).

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
failure. See `apps/mobile/docs/android-emulator-wsl2.md`.

---

### `run-mobile.sh`  (`pnpm mobile:run`)
**Run the app end-to-end on the emulator.** Boots the emulator (via `emulator.sh`),
then starts Expo/Metro and opens the app in Expo Go, leaving Metro running in the
background (log: `.expo-dev.log`). Does **not** start the backend — run `pnpm dev`
separately for working auth/API.

---

### `stop.sh`
**Stop the local Supabase stack** (`supabase stop`).

Backend service processes (started by `pnpm dev`) are stopped with `Ctrl+C` in that terminal. Local DB data is preserved between stops. To also wipe all local data: `pnpm exec supabase stop --no-backup`.

---

### `migrate.sh`
**Run pending database migrations** against `DATABASE_URL`.

Works for both the local Supabase stack (`127.0.0.1:55322`) and production Supabase. `DATABASE_URL` must already be set in the environment by a root wrapper such as `pnpm migrate:dev` or `pnpm migrate:prod`.

---

### `db-reset.sh`
**DESTRUCTIVE — wipe and recreate the local database.**

Resets the local Supabase stack DB to a clean baseline (`supabase db reset`, which auto-runs the inert `supabase/seed.sql`), then re-applies all Drizzle migrations from scratch. Safety check prevents running against non-localhost URLs. Requires confirmation before proceeding.

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
