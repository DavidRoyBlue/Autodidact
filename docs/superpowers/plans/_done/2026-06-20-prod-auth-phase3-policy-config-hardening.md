# Production Auth (Spec 2) — Plan C2: Policy & Config Hardening (Phase 3)

> Completed: 2026-06-26
>
> Status: DONE — migration `0010_policy_hardening.sql` merged + applied to prod (`drizzle.__drizzle_migrations` id 10; security advisors clear); local `supabase/config.toml` hardened (TOTP MFA, anon IP rate-limit, manual-linking); RLS defense-in-depth test + ADR-028 landed. The owner-gated prod GoTrue settings — email confirmation, password policy + leaked-password (HIBP), TOTP MFA, anonymous-signup IP rate-limit, and then `enable_anonymous_sign_ins` ON (rate-limits applied first per B1's release gate) — were applied on the prod dashboard (`cbzdsoojfhpsexuyeyxt`) on 2026-06-26. This completes Spec 2 Phase 3 and closes issue #50.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the deprecated `auth.role()` predicate with structural `TO authenticated` scoping; scope every app-table RLS policy `TO authenticated` (currently `TO public`); and harden GoTrue via `supabase/config.toml` (email confirmation, password policy + leaked-password/HIBP protection, anonymous-signup IP rate-limit on **local**, redirect allow-list, and **TOTP MFA enablement**). **No CAPTCHA** — it is poor UX for the phone app and explicitly not wanted; IP rate-limit + B2's stale-anonymous cleanup are the anonymous-abuse mitigations. Production anonymous sign-in is **ENABLED** in this plan — *after* the prod rate-limits are tuned (order matters), satisfying B1's release gate.

**Architecture:** One hand-authored SQL migration (`0010_policy_hardening.sql`) that drops + recreates the 13 existing app-table policies with `TO authenticated` and removes the `auth.role()` text from the `courses`/`modules` policies. Plus edits to `supabase/config.toml`'s `[auth]` section for the GoTrue settings (config-as-code for local; mirrored to prod manually because `supabase config push` parity is an open Spec 1 item). MFA is **config-only** (enable the TOTP factor); the mobile enrollment/challenge UI is a documented follow-up, not in this plan.

**Tech Stack:** Drizzle hand-authored SQL migration (`packages/db/migrations/`, registered in `meta/_journal.json`); `supabase/config.toml` (GoTrue settings); Supabase MCP `get_advisors` / `execute_sql` / `apply_migration` for prod verification + apply; Vitest for the RLS defense-in-depth assertion.

**Source spec:** `docs/superpowers/specs/_done/2026-06-18-production-auth-design.md` (Spec 2), **Phase 3** / decision **D4′** (+ D5 anonymous, D7 `is_anonymous()`). This is **Plan C2**; the Data-API lockdown (Phase 2 / D3) is **Plan C1** (`2026-06-20-prod-auth-phase2-data-api-lockdown.md`) and **must land first**. Builds on **Plan A** (`is_anonymous()` helper, identity contract) and **B1** (which enabled `enable_anonymous_sign_ins = true` on the **local** stack only and gated prod anonymous release on this plan's anonymous-abuse mitigations — now IP rate-limit + B2 cleanup, no CAPTCHA).

> **Prod project (CONFIRMED):** `cbzdsoojfhpsexuyeyxt`. After C1 this plan adds **id 10 / `0010`** to `drizzle.__drizzle_migrations`.

## Global Constraints

- **Sequencing:** C2 depends on **C1** (it assumes the Data API is already closed). The policy rewrites in C2 are therefore pure **defense-in-depth** (after C1, `anon`/`authenticated` have no table grants at all), but they are kept correct and advisor-clean.
- **Drizzle is the sole migration authority**; hand-authored SQL only; **no** `supabase/migrations/`. `db:generate:dev` is broken → hand-write `0010`, hand-append `meta/_journal.json`, **no** snapshot file.
- **Anonymous users are first-class (D5).** Supabase anonymous users carry `role: authenticated` in their JWT (with `is_anonymous: true`), so **`TO authenticated` INCLUDES guests** — correct, because guests own enrollments/progress/chat and carry them through an account upgrade. **Do not** add an `is_anonymous() = false` guard to any current own-row or public-read policy. The `is_anonymous()` helper (Plan A) stays available for any *future* guest-exclusion policy; none is added now.
- **Preserve every policy predicate exactly** — only change the role scope (`TO public` → `TO authenticated`) and drop the redundant `auth.role() = 'authenticated'` text (now structural). Keep the `(SELECT auth.uid())` / `(SELECT id FROM public.users WHERE …)` sub-selects verbatim (they are the `0004` performance-optimized form).
- **GoTrue settings live in `config.toml`, never in a migration.** Config keys vary by Supabase CLI version — **confirm each key against the installed CLI's `config.toml` schema** before writing it; the keys below are the canonical names.
- **Prod anonymous is ENABLED** (decision): C2 lands the mitigations (IP rate-limit + B2 cleanup — **no CAPTCHA**) and turns anonymous sign-in ON in **both local and prod**. **Ordering is mandatory:** tune + apply the prod rate-limits **first**, then flip `enable_anonymous_sign_ins = true` in prod — never the reverse (an unthrottled prod anon endpoint is the abuse vector B1 flagged). No external prerequisite remains (CAPTCHA dropped — poor mobile UX).
- **`supabase config push` parity is unresolved (Spec 1).** Prod GoTrue settings are applied manually (Dashboard → Auth, or Management API) and recorded; document, don't automate.
- **Test/verify env workaround:** prefix package test runs with `env -u DATABASE_URL -u SUPABASE_URL -u QUEUE_PROVIDER`.

---

### Task 1: Migration `0010_policy_hardening.sql`

**Files:**
- Create: `packages/db/migrations/0010_policy_hardening.sql`
- Modify: `packages/db/migrations/meta/_journal.json` (append; **no** snapshot file)

**Interfaces:**
- Produces: all 13 app-table policies recreated `TO authenticated`; `courses`/`modules` policies no longer reference `auth.role()`.

**Reference — current policies (from live state):** `users` (select/update own), `courses` (select public), `modules` (select public-course), and `enrollments` / `module_progress` / `chat_sessions` (select/insert/update own). All currently `TO public`. Own-row predicate is `user_id = (SELECT id FROM public.users WHERE supabase_id = (SELECT auth.uid()) LIMIT 1)`; `users` keys directly on `supabase_id = (SELECT auth.uid())`.

- [x] **Step 1: Author the migration SQL**

Create `packages/db/migrations/0010_policy_hardening.sql`:

```sql
-- 0010_policy_hardening.sql
-- Spec 2 Phase 3 / D4' — drop deprecated auth.role(); scope every app-table policy TO authenticated.
-- Predicates are preserved verbatim (the 0004 performance-optimized form); only role scope changes.
-- Anonymous users carry role=authenticated, so TO authenticated correctly INCLUDES guests (D5).

-- users ---------------------------------------------------------------------
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT TO authenticated USING (supabase_id = (SELECT auth.uid()));
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated USING (supabase_id = (SELECT auth.uid()));

-- courses (drop the auth.role() predicate; role scoping is now structural) ----
DROP POLICY IF EXISTS "courses_select_public" ON public.courses;
CREATE POLICY "courses_select_public" ON public.courses
  FOR SELECT TO authenticated USING (is_public = TRUE);

-- modules -------------------------------------------------------------------
DROP POLICY IF EXISTS "modules_select_public_course" ON public.modules;
CREATE POLICY "modules_select_public_course" ON public.modules
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.courses
            WHERE courses.id = modules.course_id AND courses.is_public = TRUE));

-- enrollments ---------------------------------------------------------------
DROP POLICY IF EXISTS "enrollments_select_own" ON public.enrollments;
DROP POLICY IF EXISTS "enrollments_insert_own" ON public.enrollments;
DROP POLICY IF EXISTS "enrollments_update_own" ON public.enrollments;
CREATE POLICY "enrollments_select_own" ON public.enrollments
  FOR SELECT TO authenticated USING (user_id = (SELECT id FROM public.users WHERE supabase_id = (SELECT auth.uid()) LIMIT 1));
CREATE POLICY "enrollments_insert_own" ON public.enrollments
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT id FROM public.users WHERE supabase_id = (SELECT auth.uid()) LIMIT 1));
CREATE POLICY "enrollments_update_own" ON public.enrollments
  FOR UPDATE TO authenticated USING (user_id = (SELECT id FROM public.users WHERE supabase_id = (SELECT auth.uid()) LIMIT 1));

-- module_progress -----------------------------------------------------------
DROP POLICY IF EXISTS "module_progress_select_own" ON public.module_progress;
DROP POLICY IF EXISTS "module_progress_insert_own" ON public.module_progress;
DROP POLICY IF EXISTS "module_progress_update_own" ON public.module_progress;
CREATE POLICY "module_progress_select_own" ON public.module_progress
  FOR SELECT TO authenticated USING (user_id = (SELECT id FROM public.users WHERE supabase_id = (SELECT auth.uid()) LIMIT 1));
CREATE POLICY "module_progress_insert_own" ON public.module_progress
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT id FROM public.users WHERE supabase_id = (SELECT auth.uid()) LIMIT 1));
CREATE POLICY "module_progress_update_own" ON public.module_progress
  FOR UPDATE TO authenticated USING (user_id = (SELECT id FROM public.users WHERE supabase_id = (SELECT auth.uid()) LIMIT 1));

-- chat_sessions -------------------------------------------------------------
DROP POLICY IF EXISTS "chat_sessions_select_own" ON public.chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_insert_own" ON public.chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_update_own" ON public.chat_sessions;
CREATE POLICY "chat_sessions_select_own" ON public.chat_sessions
  FOR SELECT TO authenticated USING (user_id = (SELECT id FROM public.users WHERE supabase_id = (SELECT auth.uid()) LIMIT 1));
CREATE POLICY "chat_sessions_insert_own" ON public.chat_sessions
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT id FROM public.users WHERE supabase_id = (SELECT auth.uid()) LIMIT 1));
CREATE POLICY "chat_sessions_update_own" ON public.chat_sessions
  FOR UPDATE TO authenticated USING (user_id = (SELECT id FROM public.users WHERE supabase_id = (SELECT auth.uid()) LIMIT 1));
```

- [x] **Step 2: Register the migration**

Append to `packages/db/migrations/meta/_journal.json` (after `0009`'s `idx:8`):
```json
{ "idx": 9, "version": "7", "when": 1782300000000, "tag": "0010_policy_hardening", "breakpoints": true }
```
No snapshot file.

- [x] **Step 3: Apply locally + verify policy state**

```bash
pnpm migrate:dev
PGURL=postgresql://postgres:postgres@127.0.0.1:55322/postgres
psql "$PGURL" -c "select tablename, policyname, roles, qual is not null as has_using, with_check is not null as has_check from pg_policies where schemaname='public' order by tablename, policyname;"
psql "$PGURL" -c "select policyname from pg_policies where schemaname='public' and (qual ilike '%auth.role()%' or with_check ilike '%auth.role()%');"
```
Expected: every policy's `roles = {authenticated}`; the second query returns **no rows** (no `auth.role()` remaining).

---

### Task 2: GoTrue hardening in `supabase/config.toml` (local)

**Files:**
- Modify: `supabase/config.toml` (`[auth]` and sub-tables)

**Interfaces:** local GoTrue enforces confirmation, password policy + HIBP, anonymous-signup IP rate-limit, redirect allow-list, and offers TOTP MFA enrollment.

> B1 already set `enable_anonymous_sign_ins = true`; **keep it** (local). Confirm each key name against the installed Supabase CLI's `config.toml` schema before editing — keys below are canonical but version-sensitive.

- [x] **Step 1: Edit the `[auth]` settings**
- [x] `enable_confirmations = true` — require email confirmation for email identities.
- [x] `minimum_password_length = 8` (or the agreed value) and password requirement complexity.
- [x] Leaked-password (HIBP) protection — enable the corresponding key (e.g. `[auth] … password leaked-protection`).
- [x] `site_url` + `additional_redirect_urls` allow-list for the mobile app scheme (deep links).
- [x] `[auth.rate_limit]`: tune sign-in / sign-up / anonymous / IP limits. **This (plus B2's stale-anonymous cleanup) is the abuse mitigation for anonymous sign-ins — no CAPTCHA (poor mobile UX; not wanted for the phone app).**
- [x] `[auth.mfa.totp]`: `enroll_enabled = true`, `verify_enabled = true` (decision: config-enable TOTP only).

- [x] **Step 2: Verify the local stack boots with the new config**

```bash
supabase stop && supabase start   # or: pnpm db:reset:dev
```
- [x] Stack boots clean. A local email signup now requires confirmation. The GoTrue settings endpoint reports MFA TOTP available. "Continue as guest" (B1) still works locally.

- [x] **Step 3: Commit**

```bash
git add supabase/config.toml
git commit -m "feat(auth): GoTrue hardening — confirmation, password/HIBP, rate-limit, TOTP MFA (Spec 2 C2)"
```

---

### Task 3: Mirror settings to prod (parity + enable anon, rate-limits first)

**Files:** none (operational + a recorded checklist in this plan).

- [x] **Step 1: Apply the prod GoTrue settings**

Because `supabase config push` parity is unresolved, apply via **Dashboard → Authentication** (or the Management API) to project `cbzdsoojfhpsexuyeyxt`, mirroring Task 2 **except**:
- [x] Email confirmation: ON.
- [x] Password policy + leaked-password (HIBP) protection: ON.
- [x] MFA TOTP: enroll + verify enabled.
- [x] Redirect allow-list: prod app scheme/URLs.
- [x] Rate limits: prod-tuned **and applied first** (this + B2 cleanup are the anonymous-signup mitigations; no CAPTCHA). Verify the limits are live before the next step.
- [x] **`enable_anonymous_sign_ins` = ON** (decision) — flip **only after** the prod rate-limits above are confirmed live. This satisfies B1's release gate ("do not enable prod anon until Plan C's rate-limit mitigation is live").

- [x] **Step 2: Smoke-test prod anonymous sign-in**

After the flip: `signInAnonymously()` against prod succeeds and provisions a `public.users` row (`is_anonymous = true`) via the existing trigger; an `updateUser({ email, password })` upgrade preserves the UUID and flips `is_anonymous = false`. Confirm the rate-limit actually throttles a burst of anonymous sign-ups (e.g. rapid repeats return 429). Clean up the throwaway guest(s).

- [x] **Step 3: Record applied values**

Capture the exact prod settings applied (rate-limit values + `enable_anonymous_sign_ins = true`) in this plan's completion notes.

---

### Task 4: Apply migration `0010` to prod + verify

**Files:** none (operational).

- [x] **Step 1: Apply `0010` to prod**

**Primary:** `pnpm migrate:prod` (after C1 left the journal at id 9, this runs only `0010`).
**Fallback (MCP):** `apply_migration` name `0010_policy_hardening`, then:
```bash
shasum -a 256 packages/db/migrations/0010_policy_hardening.sql   # -> <hash10>
```
```sql
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('<hash10>', 1782300000000);
```

- [x] **Step 2: Verify prod policy state + advisors**

Via MCP `execute_sql`: confirm every `public` policy `roles = {authenticated}` and no `auth.role()` text remains. MCP `get_advisors(type: security)` → clean (no `rls_disabled_in_public`, no `auth_rls_initplan`/`auth.role()` deprecation findings). Confirm `drizzle.__drizzle_migrations` now has id 10.

---

### Task 5: RLS defense-in-depth test + docs/ADR

**Files:**
- Test: an integration test under `packages/db` (or `@autodidact/test-support` harness) asserting policy scoping.
- Modify: `docs/architecture/ADRs/` ADR-028; `docs/superpowers/plans/README.md` (index C2).

- [x] **Step 1: RLS defense-in-depth test**

Against the local stack / Testcontainers harness: `SET ROLE authenticated` with `request.jwt.claims` set to a test `sub`, then confirm policies return only that user's rows (and public courses/modules), and that an anonymous JWT (`is_anonymous: true`, still `role: authenticated`) likewise sees its own rows — verifying `TO authenticated` includes guests (D5). Follow the existing RLS test pattern if one exists; otherwise add a focused harness test.
- [x] Run: `env -u DATABASE_URL -u SUPABASE_URL -u QUEUE_PROVIDER pnpm --filter @autodidact/db test` → green.

- [x] **Step 2: Update ADR-028 + plans index**

Record in ADR-028 (or a short follow-up note): Data API closed (C1/D3), policy `TO authenticated` scoping (D4′), MFA TOTP enabled at config level with mobile enrollment UI deferred, anonymous-abuse mitigation = IP rate-limit + B2 cleanup (CAPTCHA dropped — poor mobile UX), prod anonymous sign-in ENABLED (rate-limits applied first). Add the C2 row to `docs/superpowers/plans/README.md`.

- [x] **Step 3: Commit**

```bash
git add packages/db docs/architecture/ADRs docs/superpowers/plans/README.md
git commit -m "test(db): RLS TO-authenticated defense-in-depth + docs/ADR for Plan C2 (Spec 2)"
```

---

## Verification (end-to-end, Plan C2)

```bash
pnpm migrate:dev                                                                  # 0010 applies
env -u DATABASE_URL -u SUPABASE_URL -u QUEUE_PROVIDER pnpm --filter @autodidact/db test   # RLS defense-in-depth green
# DB: every public policy roles={authenticated}; no auth.role() text remains
# config: local signup requires confirmation; TOTP enrollment available; IP rate-limit on; anon (guest) still works locally
# prod: settings mirrored; rate-limits applied FIRST then anon ENABLED; 0010 applied; get_advisors(security) clean; drizzle journal id 10
```

**Done when:** `0010` applied to local **and** prod (journal id 10); every app-table policy is scoped `TO authenticated` with no `auth.role()` remaining and the advisor is clean; GoTrue is hardened per the decisions (confirmation, password/HIBP, IP rate-limit, TOTP MFA; **no CAPTCHA**) with prod settings mirrored and **prod anonymous sign-in ENABLED (rate-limits applied first)**; the RLS defense-in-depth test (incl. the guest = `authenticated` case) passes.

## Self-review notes (spec coverage)

- **Phase 3 / D4′ mapped:** drop `auth.role()` + scope `TO authenticated` → `0010` (all 13 policies); `vector`-move DROPPED per D4′ (not in this plan); GoTrue settings via `config.toml` → Task 2, mirrored to prod → Task 3.
- **D5/D7:** anonymous users are `role: authenticated`, so `TO authenticated` includes guests by design — **no** `is_anonymous() = false` guard added; helper retained for future use. Test covers the guest case.
- **MFA (open item → decided):** config-enable TOTP only (Task 2/3); mobile enrollment + challenge UI explicitly deferred to a follow-up spec.
- **Deliberate scope / deferrals:** prod anonymous sign-in ENABLED, with prod rate-limits applied **before** the flip (IP rate-limit + B2 cleanup are the mitigations; CAPTCHA dropped — poor mobile UX); `supabase config push` parity unresolved → prod settings applied manually and recorded; depends on **C1** landing first (Data API already closed, so these policies are defense-in-depth).
