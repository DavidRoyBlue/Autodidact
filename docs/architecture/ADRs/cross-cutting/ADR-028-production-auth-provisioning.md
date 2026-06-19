# ADR-028: Production auth — identity contract, hybrid provisioning, and data-path posture

## Status

Accepted
Date: 2026-06-19

## Context

Production authentication has a functional gap and a security gap that were
confirmed against the live Supabase project (`cbzdsoojfhpsexuyeyxt`) in June
2026.

**The functional gap:** nothing provisions a `public.users` row when a user
signs up. The first user-scoped write that FKs to `users.id` (e.g.
`POST /courses/:id/enroll`) fails with a foreign-key violation. The codebase
has no JIT logic and no DB trigger. This must be closed atomically, before any
API request arrives.

**The security gap:** `anon` and `authenticated` roles hold ALL privileges on
every `public` table. The publishable key is embedded in the mobile bundle.
PostgREST is therefore an unguarded data path (including `TRUNCATE`, which is
not subject to RLS). Five tables have RLS disabled entirely.

**Stack situation:** this ADR sits alongside
[ADR-020 — Authentication strategy](./ADR-020-authentication-strategy.md),
which chose Supabase Auth and owns the question of *which* auth vendor and
why. ADR-028 does **not** revisit that choice. It owns the lower-level
decisions about *how the identity is shaped*, *how a user row is provisioned*,
and *which service is the trusted data path*. The mobile app talks only to
`services/api` for protected data (enforced by the `apps/mobile` invariant).
The API verifies JWTs via remote JWKS (RS256) and attaches
`AuthUser = { id: sub, supabaseId: sub, email, role }`. The Drizzle/`pg`
client in `packages/db/src/client.ts` connects as the `postgres` role, which
has `BYPASSRLS = true`.

The decisions here anchor the Plan A implementation (Phases 0–3), which
delivers the provisioning trigger (Phase 1), Data API lockdown (Phase 2), and
policy/config hardening (Phase 3).

## Non-goals

This ADR does not decide:

- **Which auth vendor to use** — see [ADR-020](./ADR-020-authentication-strategy.md).
- **ORM / data access layer** — see [ADR-008](../packages/db/ADR-008-orm-data-access.md).
- **Onboarding course content and auto-enroll** — deferred to the Spec 3 implementation plan.
- **DEV_AUTO_LOGIN tooling** — a dev-only concern built on top of this; separate spec (Spec 4).
- **MFA policy** — an operational decision owned by `services/api/src/modules/auth/CLAUDE.md`.
- **Migration authority (Drizzle vs. `supabase/migrations/`)** — settled by Spec 1 D1/D1a; all DDL lives in `packages/db/migrations/`.

## Decision Drivers

- **Correctness before any API call** — a missing `public.users` row makes the
  first FK-constrained write fail; provisioning must happen at the boundary
  closest to signup (the DB), not in application code that might not be reached.
- **Reconcile two independent identity references** — the API reads `AuthUser.id = sub`
  (JWT claim); the existing RLS policies read `supabase_id = auth.uid()`. These
  are two different columns. They must agree on a single UUID or one of the two
  is always wrong.
- **Low-friction onboarding** — requiring account creation before seeing value
  is a conversion barrier; anonymous sign-in lets guests start immediately and
  upgrade later.
- **Upgrade-preserving identity** — anonymous progress (enrollments, chat
  sessions) is wasted if the UUID changes on upgrade; the provisioned row must
  survive the anon→real transition.
- **Attack-surface minimisation** — the publishable key is baked into the
  mobile bundle; PostgREST must not be a usable data path even if that key
  leaks.
- **Safety of provisioning failures** — a trigger failure at signup is a
  hard, visible error; a silent fallback upsert at the API layer would mask the
  root cause and re-introduce the coupling the trigger is meant to eliminate.

## Options Considered

### D1 — Identity contract: unified UUID vs. decoupled ID

The problem: `AuthUser.id = sub` (in API code) and the RLS policy pattern
`supabase_id = auth.uid()` are simultaneously correct only when
`users.id == users.supabase_id == auth.uid()`.

#### Option D1-A: Unified UUID — `users.id = supabase_id = auth.uid()`
**What it is:** The primary key of `public.users` equals the Supabase UUID.
`supabase_id` becomes a redundant but kept column (RLS reads it directly).

**Pros**
- Makes API code and RLS policies simultaneously correct with no translation layer.
- `SELECT * FROM users WHERE id = $sub` and `supabase_id = auth.uid()` return
  the same row without a join.
- The trigger that provisions the row can use `NEW.id` for both columns.

**Cons**
- Pins `users.id` to a vendor-controlled UUID; if we migrate off Supabase Auth
  (see ADR-020 reconsideration flag), the primary key must change or a migration
  layer is needed.
- `supabase_id` remains a semi-redundant column while `id == supabase_id`.

#### Option D1-B: Decoupled ID — independent `users.id` with `sub→PK` translation
**What it is:** `users.id` is an independent `gen_random_uuid()`. A separate
column (e.g. `auth_uid`) maps Supabase UUIDs to internal IDs. API code and RLS
translate through this map.

**Pros**
- Internal ID is vendor-independent; swapping auth providers does not touch the
  primary key.
- Cleaner conceptual separation between the app identity and the auth-provider
  identity.

**Cons**
- Requires a translation lookup on every request — either a join or a
  `users WHERE auth_uid = $sub` query in API code and in every RLS policy.
- All existing RLS policies and API code need rewriting. The blast radius is
  every table with a `user_id` FK and every protected endpoint.
- The gain (vendor independence) is only realised at migration time. ADR-020
  already flags the migration trigger; we can pay the blast radius then.
- No practical gain at MVP stage where Supabase Auth is the chosen vendor.

---

### D2′ — Provisioning: DB trigger (hybrid) vs. alternatives

Original decision D2 (JIT upsert via `AuthGuard`) was superseded 2026-06-19
after Spec 1 established a real local GoTrue that makes trigger testing
feasible.

#### Option D2-A: DB trigger — `AFTER INSERT ON auth.users` (chosen as D2′)
**What it is:** A `handle_new_user()` `SECURITY DEFINER` function fires
`AFTER INSERT ON auth.users` and inserts into `public.users` atomically.
Fires for real and anonymous users. A second `AFTER UPDATE` trigger syncs
`email`/`is_anonymous` on upgrade.

**Pros**
- Fires before the GoTrue response reaches the client and before any API call,
  closing the FK gap at the source.
- Atomic with the `auth.users` insert — no window where the auth row exists
  but the `public.users` row does not.
- Client-agnostic: works regardless of how sign-in happens (mobile, direct API
  call, admin invite, anonymous).
- No per-request overhead in the API.
- `SECURITY DEFINER` + `SET search_path = ''` + fully schema-qualified names
  is Supabase's own hardened pattern for auth-schema-touching functions.

**Cons**
- Anon→real conversion is an UPDATE, not an INSERT, so the INSERT trigger does
  not fire. A second trigger (`AFTER UPDATE OF email, is_anonymous`) is required;
  both upgrade paths (`updateUser({email})` and OAuth `linkIdentity`) must be
  verified to actually update those columns in `auth.users`.
- A trigger failure fails the `auth.users` insert — signup hard-fails. The
  function must be minimal and thoroughly tested.
- Touches `auth.*`, which is a Supabase-managed schema — the `SECURITY DEFINER`
  hardening and search-path guard are non-negotiable.

#### Option D2-B: JIT upsert in `AuthGuard` (original D2, superseded)
**What it is:** On every verified request, `AuthGuard` upserts a row into
`public.users` using the Drizzle client (as `postgres`/BYPASSRLS) before
handing off to the handler.

**Pros**
- Purely in TypeScript, easier to unit-test in isolation from Supabase.
- No auth-schema DDL; simpler migration footprint.

**Cons**
- Fires only if an API request arrives. A user who signs up but never hits the
  API still has no row; a background task triggered immediately after signup
  (e.g. a webhook) sees the FK gap.
- Per-request overhead (even if cheap, it's an upsert on every authenticated
  call).
- If the upsert is kept as a fallback alongside the trigger, it masks trigger
  failures silently. The decision to remove self-healing (1c) makes this
  approach inconsistent.

#### Option D2-C: Edge Function invoked via Supabase webhook
**What it is:** A Supabase Edge Function subscribed to `auth.users` inserts
creates the `public.users` row.

**Pros**
- Provisioning logic in TypeScript; easier to read than PL/pgSQL.
- Decoupled from the main DB transaction.

**Cons**
- Webhook delivery is asynchronous and may be delayed or retried — the FK gap
  is not closed atomically. A race window exists between signup and first API
  request.
- Adds another runtime (Deno Edge Functions) to operate and test. Spec 1's
  local stack does not run Edge Functions in the same way as a DB trigger.
- More moving parts than a trigger for a simple insert.

---

### D3 — Data API (PostgREST) posture: lockdown vs. status quo vs. per-table grants

#### Option D3-A: Full lockdown — revoke all grants, keep RLS as defense-in-depth (chosen)
**What it is:** `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated`.
Default privileges revoked so future tables don't silently re-open.
`services/api` connects as `postgres` (BYPASSRLS) and is unaffected.
Existing RLS policies are kept as defense-in-depth.

**Pros**
- The publishable key becomes functionally inert for data access. A key leak is
  no longer a data-exfiltration risk.
- `TRUNCATE` (not subject to RLS) is blocked. The five RLS-disabled tables are
  also protected.
- API is completely unaffected: `postgres` bypasses RLS and the grant changes.
- Idempotent — `REVOKE` is safe to re-run.

**Cons**
- Any future feature that legitimately wants PostgREST direct access (e.g. a
  public-read endpoint for course catalogue) requires an explicit per-table,
  per-role `GRANT`.
- Existing tests that hit PostgREST via the anon key (service_role tests
  excluded — they use the admin client) may need updating.

#### Option D3-B: Status quo — rely on RLS to limit PostgREST access
**What it is:** Keep existing `GRANT ALL` to `anon`/`authenticated`; depend on
RLS policies to prevent data leaks.

**Pros**
- No migration change required.
- PostgREST remains available if a future feature needs it.

**Cons**
- `TRUNCATE` is not subject to RLS — anyone with the publishable key can
  truncate any table with RLS disabled. Five tables currently have RLS off.
- RLS policies on `courses`/`modules` use deprecated `auth.role()` — they are
  partially broken today. Relying on them as the sole guard is unsafe.
- The attack surface of a leaked publishable key is the entire data set.

#### Option D3-C: Per-table selective grants with RLS-based enforcement
**What it is:** Revoke the broad ALL grant; restore narrow grants (e.g.
`SELECT` only on `courses`, `modules`) where intentional public or authenticated
read access is wanted.

**Pros**
- Fine-grained control; public course catalogue could be served via PostgREST
  without opening the full data set.
- RLS policies remain meaningful guards within the granted surface.

**Cons**
- More complex to get right; grant omissions silently block features. Requires
  knowing the full intended PostgREST surface upfront.
- The mobile client does not use PostgREST for data today (invariant in
  `apps/mobile`). Designing a selective grant list for a surface that is not
  used adds speculative complexity.
- Can be layered on top of D3-A later with a trivial `GRANT` migration when
  actually needed.

---

### D5 — Anonymous auth: enabled (with upgrade path) vs. require signup first vs. guest-only local state

#### Option D5-A: Supabase anonymous sign-in, upgrade preserves UUID (chosen)
**What it is:** `signInAnonymously()` issues a JWT with a real UUID and
`is_anonymous: true`. The trigger provisions a `public.users` row immediately.
Upgrade via `updateUser({email})` or `linkIdentity()` preserves the UUID;
the UPDATE-sync trigger flips `email`/`is_anonymous` on the existing row.
Mitigations: CAPTCHA/Turnstile, IP rate-limit, stale-anonymous cleanup job.

**Pros**
- Low-friction entry: users start courses without creating an account. Real
  progress (enrollments, chat sessions) persists and carries over on upgrade.
- The UUID is preserved end-to-end — no row migration on upgrade, no FK
  re-pointing.
- Anonymous users are first-class via `is_anonymous` column (D6); RLS can
  explicitly exclude or include them.
- Distinct from DEV_AUTO_LOGIN (Spec 4), which serves a different layer
  (consistent persistent dev state, not ephemeral guest access).

**Cons**
- Requires a stale-anonymous cleanup job to avoid unbounded growth of orphaned
  rows. Retention window is a plan parameter.
- The UPDATE-sync trigger must be verified against both upgrade paths
  (`updateUser({email})` and OAuth `linkIdentity`) — OAuth may update
  `auth.identities` without touching `auth.users` columns, which would
  silently miss the sync trigger.
- Requires `public.users.email` to be nullable (D6) and an `is_anonymous
  boolean` column; schema migration required.

#### Option D5-B: Require signup before any interaction
**What it is:** No anonymous entry; all users must create an account before
accessing any course content.

**Pros**
- Simpler provisioning: only real users; no anonymous-cleanup concern.
- No risk of stale anonymous rows.

**Cons**
- Signup friction is a known conversion barrier for a consumer learning app.
- Incompatible with the desired onboarding UX (Spec 3: "Welcome to Autodidact"
  course starts immediately on first open).
- A new user who abandons during signup has no row and no data to recover.

#### Option D5-C: Guest mode via local state only (no auth token)
**What it is:** Unauthenticated users interact with a local-only in-app state;
no JWT, no `public.users` row. On signup, local state is migrated.

**Pros**
- No backend provisioning for guests; zero anonymous-row cleanup burden.
- No Supabase anonymous-auth feature needed.

**Cons**
- Local state migration on signup is error-prone and lossy (state format
  changes, partial migration failures).
- AI tutor interactions require the API, which requires a JWT. A guest cannot
  use the core product feature without auth.
- Progress is not recoverable if the user reinstalls the app before signing up.
- Fundamentally breaks the end-to-end FK consistency model: there is no row to
  carry forward.

## Decision

**D1: We use the unified UUID identity contract: `users.id = users.supabase_id = auth.uid()`.**

**D2′: We provision via a DB trigger (`AFTER INSERT ON auth.users`), with a second `AFTER UPDATE` trigger for the anon→real upgrade sync; the app layer (`AuthGuard`/`ensureProvisioned`) becomes an existence assertion and onboarding hook only, with no self-heal.**

**D3: We fully revoke `anon`/`authenticated` grants on all `public` tables; RLS policies are kept as defense-in-depth, not as the API's enforcement layer.**

**D5: We enable anonymous sign-in; the upgrade preserves the UUID so the provisioned row and progress carry over.**

## Rationale

**D1** is the only value that makes the existing API code (`AuthUser.id = sub`)
and the existing RLS policies (`supabase_id = auth.uid()`) simultaneously
correct without touching either. Option D1-B's vendor-independence benefit is
real but deferred: it is only relevant at migration time, and ADR-020 already
names explicit migration triggers. The blast radius of D1-B now (every table,
every policy, every API endpoint) is larger than the gain at this stage.

**D2′** over D2-B: the trigger closes the FK gap atomically at the source,
before any API or background task can race with it. Option D2-B (JIT in
`AuthGuard`) has a race window and a per-request cost. More importantly,
keeping an API-layer upsert as a fallback would mask trigger failures silently —
the deliberate removal of self-heal (1c) is what makes trigger failures
immediately visible and fixable. Option D2-C (Edge Function webhook) adds
asynchrony and a second runtime without closing the race window. We sacrifice
pure-TypeScript testability of the provisioning path; the mitigation is testing
against the real local GoTrue stack established by Spec 1, and explicit
acceptance tests for both upgrade paths.

**D3-A** over D3-B: `TRUNCATE` is not subject to RLS. Five tables have RLS
disabled today. The status quo is not actually protected by RLS across the
board. The `postgres` role bypasses RLS, so the lockdown has zero impact on
API queries. We sacrifice the convenience of PostgREST as a fallback data path;
D3-C (selective grants) can be layered on top later for any intentional
PostgREST surface.

**D5-A** over D5-B/C: Anonymous auth with UUID preservation lets guest progress
carry forward on upgrade with no migration logic. The cleanup cost (stale-
anonymous job) is bounded and scheduled through the existing worker infrastructure
(ADR-027). D5-B blocks the intended onboarding UX. D5-C requires local-state
migration and breaks API-dependent features (AI tutor) for guests.

## Consequences

### Positive
- The FK gap is closed at the DB boundary for every sign-in method — real,
  anonymous, admin-invited — before any application code can observe it.
- The identity contract is explicit and single-source: one UUID, one place
  (`users.id = supabase_id = auth.uid()`). The API and RLS both read it
  correctly.
- The publishable key is no longer a data-exfiltration vector. A key leak does
  not expose any app table.
- Anonymous users are first-class: provisioned immediately, upgradeable without
  data loss, cleanable on a schedule.
- Trigger failures are loud (signup hard-fails) rather than silent, making them
  fast to discover and fix.

### Negative
- The INSERT trigger does not cover the anon→real upgrade; a second UPDATE
  trigger is required and must be verified against both upgrade paths before
  production. If OAuth `linkIdentity()` updates `auth.identities` without
  touching `auth.users` columns, the UPDATE trigger silently misses the sync —
  requiring a fallback (trigger on `auth.identities` INSERT or an explicit
  API-layer sync on the upgrade endpoint).
- A bug in `handle_new_user()` fails the entire signup. The function must be
  minimal, hardened (`SET search_path = ''`, fully schema-qualified names), and
  tested against the real GoTrue stack.
- Any future intentional PostgREST access requires an explicit `GRANT`
  migration per table/role. This is a one-line migration but is now a mandatory
  step for any such feature.
- `public.users.email` must be nullable and an `is_anonymous` column added;
  downstream code that assumed `email NOT NULL` needs updating.

### Follow-up decisions
- Phase 1 (implementation): verify both upgrade paths against the real GoTrue
  stack; if the OAuth path does not update `auth.users` columns, choose and
  implement the fallback (see 1b in the spec).
- Phase 2: identify the migration or grant source that gave `anon`/`authenticated`
  ALL privileges, so it is not re-applied on fresh setups.
- Phase 3: replace deprecated `auth.role()` in existing RLS policies with
  `TO authenticated` scoping; configure GoTrue settings (email confirmation,
  anonymous toggle, CAPTCHA, rate limits) via `supabase/config.toml`.
- Stale-anonymous retention window `N` is a plan parameter — choose before
  Phase 1 ships to production.
- If ADR-020's reconsideration triggers fire (Supabase Auth migration), D1's
  vendor-pinned PK is the migration cost: primary key values must either be
  preserved or all FKs re-pointed.
- `is_anonymous()` SQL helper (D7 in spec) must be kept consistent with the
  `is_anonymous` column (D6); if the column is the authoritative source, the
  helper is defense-in-depth for RLS and should be documented as such.
