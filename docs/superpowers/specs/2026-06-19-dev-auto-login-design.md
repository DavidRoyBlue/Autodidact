# DEV_AUTO_LOGIN — Design Spec

**Date:** 2026-06-19
**Status:** Draft (brainstorming) — pending review, then implementation plan
**Position:** **Spec 4 of 4.** Depends on Spec 1 (local Supabase stack) and Spec 2 (auth/provisioning). **Unblocks:** Claude Code (CC) autonomous/unattended runs on the project.

> **Cross-refs:** Spec 1 [`2026-06-19-local-supabase-stack-design.md`](2026-06-19-local-supabase-stack-design.md) (local stack, `db-reset.sh` post-migrate slot, env-driven mobile config); Spec 2 [`2026-06-18-production-auth-design.md`](2026-06-18-production-auth-design.md) (the `handle_new_user` trigger + real local GoTrue). Bound by the `fa73ba8` invariant ([`packages/db/CLAUDE.md`](../../../packages/db/CLAUDE.md)): **schema** goes through Drizzle migrations; the dev **fixture is data**, inserted at seed time via the Drizzle client — *not* a migration.

---

## Problem

The app gates every screen behind the auth UI. For CC to run unattended (drive the app via `run-mobile`/mobile-mcp, exercise real flows), it must get past the gate without a human typing credentials — into a **known, persistent, real authenticated account** so state is consistent across runs and RLS is tested as a genuine non-anonymous user.

This is **distinct from anonymous sign-in** (Spec 2): anonymous auth is a *production* onboarding UX (throwaway session, no persistent state, recoverable only by linking). DEV_AUTO_LOGIN is *developer tooling* — a persistent `test@autodidact.dev` real email/password account with deterministic seeded state. Both exist; they serve different layers. (A prior session wrongly called this obsolete after anonymous auth was added — it is not.)

## Goal

In dev only, the app auto-signs-in as a seeded `test@autodidact.dev` account on launch, landing CC in the authenticated app with deterministic state — using the **real** auth path (real local GoTrue token, JWKS-verified by the API, real RLS), and **provably inert in production**.

## Non-goals

- Any production auth behavior (that's Spec 2). DEV_AUTO_LOGIN adds **no** API-side auth bypass.
- Anonymous sign-in (Spec 2) — different feature, different layer.
- Live LLM course generation for the test user's state — deliberately avoided for determinism (see D3).
- A schema change — the fixture is seed *data*, not DDL.

---

## Decisions & drivers

- **D1 — The test user is created via the Supabase Admin API**, not raw SQL. A TS seed script calls `getSupabaseAdmin().auth.admin.createUser({ email, password, email_confirm: true })` against the **local** GoTrue. This uses GoTrue's real user creation (correct password hashing, identities row) and **fires the `handle_new_user` trigger (Spec 2) → `public.users` is provisioned automatically**. Idempotent: if the user exists, look it up instead of failing. (Raw `INSERT INTO auth.users` is rejected — fragile, duplicates GoTrue internals.)
- **D2 — Stable identity = the email `test@autodidact.dev`; the UUID is NOT pinned (decided).** Password comes from `.env.dev` (`DEV_LOGIN_PASSWORD`, a throwaway dev value) — the *same* source the mobile app uses to sign in, so there is one credential source. The user UUID is GoTrue-generated; the seed script **captures it** and wires the fixture to it. Pinning a fixed UUID is **rejected**: `admin.createUser` won't accept a custom `id`, and a raw `INSERT INTO auth.users` to force one skips the `auth.identities` row, which breaks `signInWithPassword`. The UUID only changes on a full `supabase db reset` (rare, explicit) and is stable between resets. **CC uses the email as its cross-session handle, never the UUID** — any persistent reference notes `test@autodidact.dev`, not the id.
- **D3 — Persistent state = bare provisioned user + a deterministic, DEV-ONLY fixture** (one static course + modules + enrollment + partial `module_progress`), inserted via the Drizzle client in the seed step. **No LLM generation** — unattended runs must not depend on OpenAI cost/latency/nondeterminism. This is separate from Spec 3's *production* onboarding course (LLM-generated, auto-enrolled at runtime).
- **D4 — Mobile auto-login is gated by `__DEV__` AND `extra.devAutoLogin`.** `app.config.ts` (env-driven per Spec 1) sets `extra.devAutoLogin = { email, password }` only when `DEV_AUTO_LOGIN` is truthy in the loaded `.env.dev`. On launch, after session-restore resolves, if there's no session → `supabase.auth.signInWithPassword(...)`; rely on the existing `onAuthStateChange` listener to populate the store (no manual `setSession`).
- **D5 — The API needs NO dev handling.** The test user's token is a real local-GoTrue JWT; the existing guard verifies it via JWKS like any user. This is the point: DEV_AUTO_LOGIN exercises the *real* auth + RLS path as a real non-anonymous user.
- **D6 — Provably inert in production (defense in depth):** (1) `__DEV__` is `false` in release builds; (2) `DEV_AUTO_LOGIN` is never set in EAS `preview`/`production` profiles or prod backend env; (3) `app.config.ts` won't populate `extra.devAutoLogin` without the env var; (4) **the `test@autodidact.dev` account does not exist in the prod Supabase project** — the seed is hard-guarded to local-only (D7) — so even a hypothetical stray auto-login call **fails closed**; (5) optional runtime assertion: refuse auto-login unless `SUPABASE_URL` is local.
- **D7 — The seed script hard-guards its target.** It aborts unless `SUPABASE_URL`/`DATABASE_URL` point at the local stack (mirrors `db-reset.sh`'s localhost guard), so `test@autodidact.dev` can never be created in prod.

---

## Architecture / components

### 1. Dev-seed script (`packages/db`)
- A TS script (e.g. `packages/db/src/seed/dev-user.ts`, exposed as `pnpm db:seed:dev`).
- Steps: (a) **local-target guard** (D7) — abort if not local; (b) ensure auth user via admin `createUser` (idempotent; capture UUID `X`); (c) the `handle_new_user` trigger has now created `public.users` for `X` — assert it exists; (d) insert the **deterministic fixture** (course + modules + enrollment + `module_progress`) via the Drizzle client, keyed to `X`, idempotent (skip if the fixture course/enrollment already exists).
- Uses local `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (admin) and local `DATABASE_URL` (Drizzle) from `.env.dev`.

### 2. Wiring into the local lifecycle (Spec 1's post-migrate slot)
- `pnpm db:seed:dev` runs **after** `drizzle-kit migrate` in `setup.sh` (first run), `db-reset.sh` (every reset), **and `dev.sh` (every `pnpm dev` boot)** — decided. It's idempotent (finds the existing user, skips), and always-running guarantees CC never launches into a missing-seed state where it falls through to the auth UI and gets stuck.
- Never via `supabase/seed.sql` (inert per Spec 1) or `supabase db reset` auto-seed.
- Order: `supabase start` → `drizzle-kit migrate` → `db:seed:dev`.

### 3. Env + mobile config
- `.env.dev` / `.env.example`: `DEV_AUTO_LOGIN=true|false`, `DEV_LOGIN_EMAIL=test@autodidact.dev`, `DEV_LOGIN_PASSWORD=<throwaway>` (documented dev-only; never a real password).
- `app.config.ts`: load root `.env.dev` (per Spec 1) and set `extra.devAutoLogin = { email, password }` only when `DEV_AUTO_LOGIN` is truthy; otherwise `undefined`.

### 4. Mobile auto-login (`apps/mobile/app/_layout.tsx`)
- Dev-only effect, after session-restore resolves: if `__DEV__ && extra.devAutoLogin && !session` → `signInWithPassword({ email, password })`; existing listener + router guard carry it into `(app)`. On failure (e.g. seed not run), log a clear warning and fall through to the normal sign-in screen — never crash.
- Emulator reaches local GoTrue at `http://10.0.2.2:54321` (Spec 1).

### 5. Deterministic dev fixture (definition)
- One known course ("Dev Test Course") with N modules, an enrollment for the test user, and partial `module_progress` (some complete, some in-progress) — enough to render list/detail/progress screens with non-empty, stable state. Exact content is an open item.

### 6. Docs
- Document the flag, the seeded account, and "how CC uses it" in the mobile README / root README + `run-mobile` notes; note the prod-inert guarantees.

---

## Data flow

```
db-reset.sh:  supabase start → drizzle-kit migrate → pnpm db:seed:dev
  db:seed:dev:  [guard local] → admin.createUser(test@autodidact.dev)
                 → handle_new_user trigger → public.users row
                 → Drizzle insert deterministic fixture (course/modules/enrollment/progress)

app launch (__DEV__ && extra.devAutoLogin):
  restore session → none → signInWithPassword(test creds) → local GoTrue JWT
  → onAuthStateChange → store → router guard → (app)
  → apiFetch(real token) → API JWKS verify → queries run as real non-anonymous user (RLS exercised)
```

## How CC uses it (in practice)

With `DEV_AUTO_LOGIN=true` and the local stack seeded, CC launches the app (via `run-mobile`/mobile-mcp on the emulator) and can assume:
- It is **already authenticated** as `test@autodidact.dev` shortly after launch — no auth UI to navigate.
- A **real non-anonymous** session (valid JWT, RLS applies as a real user).
- **Deterministic state**: the "Dev Test Course" fixture is present with known modules/progress, identical across `db-reset.sh` runs (stable email; identical fixture). UUID is consistent within a reset; the email is the stable handle across resets.
- It can drive any `(app)` screen and make authenticated API calls without setup.

## Error handling / edge cases
- Seed run twice → one auth user, one fixture (idempotent).
- Seed against a non-local target → aborts (D7).
- Auto-login when the user isn't seeded → warning + fall through to sign-in UI (no crash).
- `DEV_LOGIN_PASSWORD` is embedded in the dev JS bundle via `extra` — acceptable for dev; must be throwaway.

## Testing / verification
- **Seed:** idempotency (twice → one user + one fixture); local-only guard refuses a non-local URL; after seeding, `public.users` exists for the test user (proves the trigger fired).
- **Mobile auto-login (unit):** no-op when `extra.devAutoLogin` absent, when not `__DEV__`, or when a session exists; fires `signInWithPassword` when gated (mock `supabase`, `expo-constants`, store at the seam, per `apps/mobile` jest rules).
- **Manual:** `run-mobile` with the flag → app lands in `(app)` as the test user; an authenticated API call returns the fixture; confirm the session is non-anonymous.
- **Prod safety:** assert a release build (`__DEV__` false) never auto-logs-in; assert no `DEV_AUTO_LOGIN` in `eas.json` `preview`/`production` env.

## Risks
- **UUID not stable across full resets** (GoTrue-generated). Accepted (D2): stable email is the handle, UUID captured per reset for fixtures; pinning is rejected.
- **Fixture drift** vs evolving schema — keep it minimal; it's typed via the Drizzle client so schema changes surface at compile time.
- **Password in dev bundle** — throwaway only; documented.
- **Misuse** — env set in a non-local context: the seed guard + nonexistent prod account make it fail closed.

## Resolved (2026-06-19)
- **UUID stability → stable-email-only, no pinned UUID** (see D2).
- **Run `db:seed:dev` on every `pnpm dev` boot → yes, include in `dev.sh`** (idempotent; prevents CC getting stuck at the auth UI) (see component 2).

## Open items for the implementation plan
- **Exact dev fixture content** (course title, module count, which progress states).
- Confirm `app.config.ts` `.env.dev` loading approach is shared with Spec 1 (single dotenv load, not duplicated).
