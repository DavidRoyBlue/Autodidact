# Production-Ready Auth — Design Spec

**Date:** 2026-06-18
**Status:** In progress (as of 2026-06-24) — Phases 0–2 shipped to prod (Plans A/B1/B2/C1, migrations `0006`–`0009`); Phase 3 partially shipped (Plan C2: migration `0010` merged + on prod, but the GoTrue dashboard hardening + flipping anon ON in prod are owner-gated and outstanding — see [Plan C2](../../plans/in-progress/2026-06-20-prod-auth-phase3-policy-config-hardening.md) and `note-to-self.md`). Original decisions preserved; superseded ones marked inline.
**Scope:** Functional correctness + security hardening of production auth.

> **Decomposition (agreed 2026-06-19).** The work splits into four sequenced specs:
> 1. **Local Supabase stack** (`supabase start`) — infra substrate, done first.
> 2. **Production Auth** — *this spec*.
> 3. **Onboarding course "Welcome to Autodidact" + auto-enroll** — separate spec.
> 4. **DEV_AUTO_LOGIN** — dev tooling (persistent seeded `test@autodidact.dev`, `__DEV__` auto-login for unattended runs); built on top of this. **Not obsolete** — it serves a different layer than anonymous sign-in (it gives *consistent, persistent* state; anonymous gives a fresh, unrecoverable guest).
>
> **Deltas — incorporated into the body on 2026-06-19 (summary):**
> - **Provisioning is HYBRID** — a DB trigger creates the `public.users` row (supersedes D2's JIT row-creation); the app layer becomes the onboarding hook only.
> - **Anonymous sign-in is ENABLED** (production onboarding), with an explicit anon→real upgrade-sync mechanism (the trigger gap), and a stale-anonymous cleanup job.
> - **`public.users.email` becomes nullable + add `is_anonymous` boolean**; add an `is_anonymous()` SQL helper for RLS.
> - **All DDL (trigger, function, helper, RLS, GRANT/REVOKE) lives in `packages/db/migrations/` as hand-authored SQL** (Spec 1 D1/D1a — Drizzle is the sole migration authority; **never** `supabase/migrations/`). GoTrue *settings* live in `supabase/config.toml` (Spec 1).
> - **pgvector extension move is DROPPED** (still enable RLS on `module_content_chunks`).
> - **Prod Supabase project = `cbzdsoojfhpsexuyeyxt` — CONFIRMED** (open item closed).

---

## Problem

Production authentication has one functional bug and several security holes, all verified live against the Supabase project (`cbzdsoojfhpsexuyeyxt`) and the codebase:

1. **Signup is broken.** Nothing provisions a `public.users` row on signup or first authenticated request (no JIT logic, no DB trigger). The first user-scoped write that FKs to `users.id` (e.g. `POST /courses/:id/enroll`) fails with a foreign-key violation.
2. **The Data API is wide open.** `anon` and `authenticated` roles hold **ALL** privileges (incl. `TRUNCATE`, `DELETE`) on **every** `public` table. The publishable (anon) key is embedded in the mobile bundle, so anyone can call PostgREST directly. RLS only partially mitigates this, and `TRUNCATE` is not subject to RLS at all.
3. **5 tables have RLS disabled** (`checkpoints`, `checkpoint_blobs`, `checkpoint_writes`, `checkpoint_migrations`, `module_content_chunks`) → fully readable/writable via the anon key (LangGraph state, generated content, embeddings).
4. **Contract contradiction.** The API code assumes `users.id == sub`; the existing RLS policies assume `users.id` is independent and mapped via `supabase_id = auth.uid()`. These reconcile **only** when `users.id == supabase_id == auth.uid()`.
5. **Policy/config hardening gaps:** deprecated `auth.role()` in policies, policies scoped `TO public`, `vector` extension in `public`, and unverified GoTrue settings (email confirmation, leaked-password protection, etc.).

## Goals

Production-ready auth: signup works end-to-end (via trigger-based provisioning); **anonymous onboarding** with a clean upgrade path; the Data API attack surface is closed; RLS is consistent and defense-in-depth; auth policies and GoTrue config follow current Supabase security guidance.

## Non-goals

- Dev/test auto-login convenience (separate later spec, built on this).
- Switching the API to enforce via RLS (it intentionally bypasses RLS as a trusted server; RLS is defense-in-depth for the Data API surface).
- Role decoupling (independent `users.id` + `sub→PK` translation) — rejected; far larger blast radius for no practical gain at this stage.
- Multi-tenant / org roles / advanced RBAC.

---

## Verified current state (foundation for the design)

- **Mobile** uses the Supabase JS client for **auth only** (`signInWithPassword`); tokens live in `expo-secure-store` + Zustand; **all data flows through `services/api`** (enforced by the `apps/mobile` invariant). The client never touches PostgREST for data.
- **API** verifies JWTs via **remote JWKS (RS256)** with issuer + audience (`authenticated`) checks (`SupabaseAuthProvider`). `AuthGuard` attaches `AuthUser = { id: sub, supabaseId: sub, email, role }`.
- **Data path** is Drizzle/`pg` (`packages/db/src/client.ts`) connecting as the **`postgres` role**, which has **`BYPASSRLS = true`**. `getSupabaseAdmin()` (service_role/PostgREST) is **not used in production code** — only in tests.
- **`public.users`** *(current baseline; changed by D6/D2′)*: `id uuid default gen_random_uuid()`, `supabase_id uuid NOT NULL`, `email text NOT NULL`, `display_name`, timestamps. No provisioning, no trigger.
- **RLS**: app tables have policies of the form `user_id = (SELECT users.id FROM users WHERE supabase_id = auth.uid())`; `users` policies use `supabase_id = auth.uid()`; `courses`/`modules` use deprecated `auth.role() = 'authenticated'`. 5 tables have RLS disabled. `anon`/`authenticated` are granted ALL on every `public` table.

---

## Decisions & drivers

- **D1 — Identity contract: `users.id == users.supabase_id == auth.uid()` (the JWT `sub`).** This is the *only* value that makes the API code and the existing RLS policies simultaneously correct. `supabase_id` is **not** dead — RLS reads it. Documented in an ADR.
- ~~**D2 — Provisioning: JIT upsert via Drizzle (`postgres` role), invoked from `AuthGuard`.**~~ **SUPERSEDED 2026-06-19 → D2′.** *(Original rationale: the admin client was unused and the stubbed local auth schema made a trigger untestable. Spec 1's real local GoTrue removes that objection.)*
- **D2′ — Provisioning is HYBRID (supersedes D2):** a **`handle_new_user` DB trigger on `auth.users` (AFTER INSERT)** atomically creates the `public.users` row (`id = supabase_id = NEW.id`, `email`/`is_anonymous` from the auth row). It fires for **all** users — including anonymous — *before* they ever reach the API, so the FK gap is closed at the source. The **app layer (`AuthGuard`/`ensureProvisioned`) is no longer the row-creator** — it becomes the **onboarding hook only** (auto-enroll, course gen — wired by Spec 3). Per Spec 1 D1/D1a, the trigger + its function are **hand-authored SQL in `packages/db/migrations/`**, not `supabase/migrations/`.
- **D3 — Data API lockdown: revoke `anon`/`authenticated` privileges on all `public` tables + enable RLS on the 5 disabled tables; keep RLS policies as defense-in-depth.** Safe because the API bypasses RLS and the client never uses PostgREST for data. Authored as committed DB migrations. *(Unchanged.)*
- ~~**D4 — Policy & config hardening:** … move `vector` out of `public` …~~ **REVISED 2026-06-19 → D4′.**
- **D4′ — Policy & config hardening (supersedes D4):** replace deprecated `auth.role()` with `TO authenticated`; scope policies `TO authenticated`; **GoTrue settings via `supabase/config.toml`** (Spec 1), not a dashboard-only checklist. **The `vector` extension move is DROPPED** (deferred until embeddings need it).
- **D5 — Anonymous sign-in is ENABLED (production onboarding).** `signInAnonymously()` for low-friction entry; upgrade via `updateUser({email})`/`linkIdentity()` **preserves the user UUID**, so the provisioned `public.users` row + progress carry over. Mitigations: IP rate-limit and a stale-anonymous-user cleanup job. *(Revised 2026-06-21: CAPTCHA/Turnstile DROPPED — poor UX for the phone app; rate-limit + cleanup are the mitigations.)* Distinct from DEV_AUTO_LOGIN (Spec 4).
- **D6 — Schema changes:** `public.users.email` becomes **nullable** (anonymous users have none) and a **`is_anonymous boolean not null default false`** column is added. The trigger populates both (real user → email set, `is_anonymous=false`; guest → email NULL, `is_anonymous=true`).
- **D7 — `is_anonymous()` SQL helper** (RLS building block) lives alongside the trigger in a Drizzle migration: `create function is_anonymous() returns boolean language sql stable as $$ select coalesce((auth.jwt() -> 'is_anonymous')::boolean, false) $$;`. RLS policies that must exclude guests use it. *(Belt-and-suspenders only: Phase 2 closes the Data API, so RLS — and this helper — evaluate for clients only if grants are ever restored. The app reads guest status from the `public.users.is_anonymous` column (D6), not this helper.)*
- **D8 — `app/_layout.tsx` is the single owner of auth-flow guard precedence (Spec 2 owns it; Spec 4 slots in).** Canonical launch order: (1) restore persisted session; (2) session present → route to `(app)`; (3) no session **and** `__DEV__` **and** `extra.devAutoLogin` → **DEV_AUTO_LOGIN slot** (`signInWithPassword`, Spec 4); (4) otherwise show auth UI offering real sign-in/up **and** `signInAnonymously` ("continue as guest", D5). The dev slot takes precedence over the guest path in dev, so the two never both fire. Spec 4 implements step (3) against this contract.

---

## Architecture (by phase)

### Phase 0 — Settle & document the contract (ADR)

- Write an ADR recording the identity contract (D1), **hybrid trigger-based provisioning (D2′)**, anonymous auth + upgrade-sync (D5), and the data-path posture ("services/api is the trusted data path; RLS + closed Data API protect the client surface" — D3). Sits alongside ADR-020 (Authentication strategy); cross-link.
- No code; this anchors the rest.

### Phase 1 — Provisioning, identity & anonymous auth (revised 2026-06-19; supersedes the JIT-row-creation approach)

**1a — Schema (Drizzle schema + migration), per D6:**
- `public.users.email` → **nullable** (it is also `unique`; multiple NULLs don't conflict in Postgres, so anonymous users coexist); add `is_anonymous boolean not null default false`. Update `packages/db/src/schema` + a generated migration.
- **Add `ON DELETE CASCADE`** to the user-owned FKs — `enrollments.user_id`, `module_progress.user_id`, `chat_sessions.user_id` → `users.id` (they currently have **none**, verified). This is what makes the cleanup job (1e) and any user deletion correct rather than FK-erroring.

**1b — Provisioning trigger (hand-authored SQL migration in `packages/db/migrations/`), per D2′:**
- `handle_new_user()` `SECURITY DEFINER` function + trigger `AFTER INSERT ON auth.users` → `insert into public.users (id, supabase_id, email, is_anonymous) values (NEW.id, NEW.id, NEW.email, NEW.is_anonymous) on conflict (id) do nothing`. Enforces `id == supabase_id == auth.uid()` (D1); fires for real **and** anonymous users before any API call.
- **Hardening (required, all `SECURITY DEFINER` functions here):** define with **`SET search_path = ''` and fully schema-qualified names** (`public.users`, `auth.*`, types) — standard Supabase practice to prevent search-path attacks. Applies to `handle_new_user`, the update-sync function, and the cleanup function.
- **Upgrade-sync (the critical gap — MUST VERIFY in implementation, not assumed):** anon→real conversion is an **UPDATE** of `auth.users` (email set, `is_anonymous`→false), *not* an INSERT, so the INSERT trigger won't fire. Plan: a second trigger `AFTER UPDATE OF email, is_anonymous ON auth.users` syncs `public.users.email`/`is_anonymous` (atomic, client-agnostic, same migration). **Phase 1 implementation MUST verify, against real GoTrue, that BOTH upgrade paths actually update those `auth.users` columns:** (a) email/OTP via `updateUser({email})`, (b) OAuth `linkIdentity()`. **Test criteria:** after each path, `public.users.email` is populated and `is_anonymous=false` for the same `id`. **If OAuth `linkIdentity` populates email via `auth.identities` without touching `auth.users` columns, the column-scoped trigger silently misses** → fallback (also trigger on `auth.identities` INSERT, or sync in the API upgrade endpoint). Choose the fallback only if verification shows the gap.
- `is_anonymous()` helper (D7) in the same migration.

**1c — App layer = onboarding hook only (no longer the row-creator):**
- `AuthGuard` no longer creates the row (the trigger does). `ensureProvisioned` is a cheap **existence assertion** + the entry point for **onboarding** (auto-enroll into the Spec 3 course, course-gen kickoff) — **Spec 3 wires the onboarding behavior**; Spec 2 only leaves the hook.
- **No self-healing upsert (rejected 2026-06-19).** The point of the trigger is atomic, security-first provisioning that does not depend on an API request arriving; a fallback upsert would reintroduce that coupling and mask trigger failures. If the row is missing (trigger failure), surface a **loud 500 and fix the trigger** — do not paper over it at the API layer.

**1d — Anonymous client flow (mobile), per D5:**
- Add `signInAnonymously()` as a low-friction entry; upgrade via `updateUser({email})` / `linkIdentity()` (UUID preserved → row + progress carry over; trigger syncs `email`/`is_anonymous`).

**1e — Stale-anonymous cleanup job:**
- Supabase has no auto-cleanup. **Scheduler = the existing worker (Cloud Tasks)** — decided 2026-06-19; **not pg_cron** (may not run under local `supabase start` → untestable in dev; the worker keeps infra consistent and testable).
- **Deletion order (no FK cascades to `auth.users`; verified):** for each stale anonymous user, delete `public.users` first — which now cascades to `enrollments`/`module_progress`/`chat_sessions` via the `ON DELETE CASCADE` added in 1a — then delete the `auth.users` row (admin API or SQL). `public.users` has no FK to `auth.users`, so its deletion is a separate explicit step. Retention window N is a plan parameter.

**1f — Mobile auth-flow guard precedence (`app/_layout.tsx`), per D8:** Spec 2 owns the canonical order — restore session → (session ⇒ `(app)`) → (`__DEV__` + `devAutoLogin` ⇒ DEV_AUTO_LOGIN slot, Spec 4) → auth UI (real sign-in/up + `signInAnonymously` guest). Spec 4 implements the dev slot against this contract; the dev path takes precedence over guest in dev so the two never both fire.

This closes the FK gap at the source (trigger) for every sign-in method, and keeps anonymous→real upgrades consistent.

### Phase 2 — Lock down the Data API (critical security)

Authored as DB migration(s) (see "Migrations" below):

- `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;` (plus sequences/functions as appropriate).
- `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;` so future tables don't silently re-open.
- **Find and fix the root cause:** identify the migration (or grant) that gave `anon`/`authenticated` ALL on every table and stop it re-granting on fresh setups.
- `ALTER TABLE … ENABLE ROW LEVEL SECURITY;` on the 5 currently-disabled tables (server-only; no client policies needed — deny-by-default; `postgres` bypasses).
- Keep existing RLS policies on the app tables as defense-in-depth (they remain correct under D1).
- Result: the publishable key can still reach **GoTrue auth endpoints** (login/signup work), but **PostgREST data access for app tables is fully closed**.

### Phase 3 — Policy & config hardening (revised 2026-06-19)

- Replace `auth.role() = 'authenticated'` in `courses_select_public` and `modules_select_public_course` with policies scoped `TO authenticated`; scope all app-table policies `TO authenticated` instead of `TO public`. Where a policy must exclude guests, combine with `is_anonymous() = false` (D7). *(All policy DDL is hand-authored SQL in `packages/db/migrations/`.)*
- ~~Move the `vector` extension out of `public`~~ — **DROPPED** (D4′); deferred until embeddings need it. *(RLS is still enabled on `module_content_chunks` in Phase 2.)*
- **GoTrue settings via `supabase/config.toml`** (Spec 1 — config-as-code, mirrored to prod per Spec 1's still-open `config push` question): require email confirmation **for email identities**; **ENABLE anonymous sign-ins** (D5) with tuned IP rate-limit (no CAPTCHA — poor mobile UX, D5 revised 2026-06-21); leaked-password protection (HIBP); password min length/strength; Site URL + redirect allow-list; evaluate MFA. *(Settings only — not DDL.)*
- **Authorization note:** any future privileged role must live in `app_metadata` (server-controlled), never `user_metadata` (user-editable). No admin role exists today; documented for the future.

---

## Migrations approach

All **DDL** — `GRANT`/`REVOKE`, `ENABLE RLS`, `CREATE POLICY`, **and the auth-schema-touching objects (`handle_new_user` trigger + function, the UPDATE-sync trigger, the `is_anonymous()` helper)** — is authored as **hand-written SQL migrations in `packages/db/migrations/`**, following the existing trail (`0003_rls.sql`, `0004_rls_fixes.sql`). This honors Spec 1 **D1/D1a**: Drizzle is the sole migration authority; **there is NO `supabase/migrations/` trail; never run `supabase migration new` / `supabase db diff`**. Schema column changes (D6) are generated by `drizzle-kit`; everything else is custom SQL. Reviewed before apply — **not** applied ad-hoc via MCP `execute_sql`/`apply_migration`. After applying, re-run `get_advisors(security)` and expect the RLS-disabled errors to clear.

**GoTrue settings** (email confirmation, anonymous toggle, rate limits, password policy, redirect allow-list) are **not DDL** — they live in `supabase/config.toml` (Spec 1) for local, mirrored to prod (Spec 1's `config push` parity question). They never go in a migration.

## Error handling

- **Provisioning:** the trigger's `insert … on conflict (id) do nothing` is race-safe; a `SECURITY DEFINER` trigger failure fails the `auth.users` insert (i.e. signup), surfaced by GoTrue — keep the function minimal, defensive, and hardened (`SET search_path=''`, schema-qualified). The UPDATE-sync trigger must be idempotent. A missing `public.users` row at the API surfaces as a **loud 500** (no self-heal, 1c) — fix the trigger. Cleanup deletes in dependency order (1e). Anonymous users (email NULL) are first-class via D6.
- **Lockdown migration:** idempotent (`REVOKE`/`ENABLE RLS` are safe to re-run); guarded so re-apply is a no-op.
- **API regression safety:** because the API runs as `postgres` (BYPASSRLS), none of the RLS/grant changes affect API queries.

## Testing

- **Provisioning (integration, trigger-based):** INSERT into `auth.users` → exactly one `public.users` row with `id == supabase_id == sub`; real user → `email` set, `is_anonymous=false`; anonymous → `email` NULL, `is_anonymous=true`. Anon→real **UPDATE** → `public.users.email`/`is_anonymous` synced (UUID unchanged, progress retained) — **tested for both email/OTP and OAuth `linkIdentity`** (1b). Cleanup deletes stale anonymous users + dependents **in order, with no FK violation** (1e).
- **Data API lockdown (SQL/integration):** `SET ROLE anon` / `authenticated` then assert `SELECT`/`INSERT`/`TRUNCATE` on app tables raise *permission denied*; assert `postgres` still succeeds.
- **RLS defense-in-depth:** with `request.jwt.claims` set to a test `sub` and `SET ROLE authenticated`, policies return only that user's rows (verifies D1 reconciliation).
- **Advisors:** `get_advisors(security)` returns no `rls_disabled_in_public` errors after migration.
- **API regression:** existing JWKS verification + guarded endpoints return data for a provisioned user; the golden-path e2e still passes.

## Affected areas (revised 2026-06-19)

- `packages/db` — schema change (D6: `email` nullable, add `is_anonymous`; **`ON DELETE CASCADE` on user-owned FKs**, 1a); hand-authored SQL migrations: hardened `handle_new_user` trigger+function (`search_path=''`), UPDATE-sync trigger, `is_anonymous()` helper, revoke grants + default privileges, enable RLS on 5 tables, rewrite/scope `courses`/`modules` policies. *(No `vector` move.)*
- `services/api` — `AuthGuard`/`ensureProvisioned` reduced to an **existence assertion + onboarding hook** (Spec 3 wires onboarding); no row creation, **no self-heal** (loud 500 on missing row).
- `apps/mobile` — `signInAnonymously()` entry + anon→real upgrade flow (`updateUser`/`linkIdentity`); **`app/_layout.tsx` guard precedence (D8)** that Spec 4 slots into.
- `supabase/config.toml` — GoTrue settings (anonymous enabled, email confirmation, rate limits, password policy, redirect allow-list). *(No CAPTCHA — D5 revised 2026-06-21.)*
- `services/worker` — stale-anonymous **ordered-delete** cleanup task (Cloud Tasks scheduled), 1e.
- `docs/architecture/ADRs` — new ADR (contract + hybrid provisioning + anonymous + Data API posture); cross-link ADR-020.
- `packages/providers` — `AuthUser` (`id = sub`) correct under D1; consider surfacing `is_anonymous` from the JWT for app use (optional).

## Rollout, risks, open items

- **Phase order 0→3.** Phases 1 and 2 are independent (API bypasses RLS), so either can land first; do 0 (ADR) first to anchor.
- ~~**Risk — `vector` extension move**~~ — dropped (D4′).
- **Risk — GoTrue email-confirmation enforcement** changes signup UX (users must confirm); coordinate with the mobile signup flow. Anonymous entry softens this (guests skip confirmation; it applies on upgrade).
- **CLOSED (2026-06-19): Prod Supabase project = `cbzdsoojfhpsexuyeyxt` — CONFIRMED.** Migrations + `config.toml` settings apply to local and to this prod project.
- **OPEN:** locate the source of the over-broad `anon`/`authenticated` grants (migration vs. manual) to prevent re-introduction.
- **MOVED → Phase 1b (must-verify in implementation, with test criteria):** the UPDATE-sync trigger's coverage of both upgrade paths (email/OTP, OAuth `linkIdentity`) — no longer an open question, it has explicit acceptance tests.
- **CLOSED (2026-06-19):** stale-anonymous cleanup scheduler = the worker (Cloud Tasks). Retention window N remains a plan parameter.
- **OPEN:** MFA scope (enable now vs. later).
- **Planning note (decomposition):** Phase 1 is large (schema + `ON DELETE CASCADE` + 2 triggers + `is_anonymous()` helper + anon client flow + `_layout` precedence + worker cleanup). Expect the plan step to split it into 2+ implementation plans.
