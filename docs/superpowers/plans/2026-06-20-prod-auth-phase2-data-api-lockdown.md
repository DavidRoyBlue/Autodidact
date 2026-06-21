# Production Auth (Spec 2) — Plan C1: Data-API Lockdown (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With the Supabase **publishable (anon) key**, PostgREST data access to every `public` table is closed (GoTrue auth endpoints keep working); the 5 currently RLS-disabled tables become deny-by-default; and future tables — including the LangGraph checkpoint tables created at runtime — are *born* without `anon`/`authenticated` grants. The Supabase security advisor returns **zero** `rls_disabled_in_public` errors on local **and** prod.

**Architecture:** One hand-authored SQL migration (`0009_data_api_lockdown.sql`) that (1) `REVOKE`s all privileges on current public tables/sequences from `anon`,`authenticated`, (2) `ALTER DEFAULT PRIVILEGES … REVOKE` so future objects are not re-granted, (3) `ENABLE ROW LEVEL SECURITY` on `module_content_chunks`, and (4) conditionally enables RLS on the 4 checkpoint tables *if they already exist* (prod/warm DBs). The fresh-DB half of the checkpoint problem is closed in app code: the Postgres checkpointer provider enables RLS on those 4 tables idempotently right after `PostgresSaver.setup()` creates them. Backend services connect as the `postgres` role (`BYPASSRLS = true`), so neither the revokes nor RLS ever block the API/worker/agent — the lock applies only to the PostgREST client surface.

**Tech Stack:** Drizzle hand-authored SQL migration (`packages/db/migrations/`, registered in `meta/_journal.json`); `@langchain/langgraph-checkpoint-postgres@0.0.4` (`PostgresSaver`); Vitest + the local Supabase stack (`127.0.0.1:55322`) for the checkpointer RLS test; Supabase MCP `get_advisors` / `apply_migration` for prod verification + apply.

**Source spec:** `docs/superpowers/specs/2026-06-18-production-auth-design.md` (Spec 2), **Phase 2** / decision **D3**. This is **Plan C1**; policy + GoTrue config hardening (Phase 3 / D4′) is **Plan C2** (`2026-06-20-prod-auth-phase3-policy-config-hardening.md`). Builds on **Plan A** (identity contract, provisioning triggers, `is_anonymous()` helper, migration `0008` REVOKE EXECUTE) and **B1/B2** (already merged + applied to prod).

> **Prod project (CONFIRMED):** `cbzdsoojfhpsexuyeyxt`. Prod `drizzle.__drizzle_migrations` is synced through id 8 (`0008`); this plan adds **id 9 / `0009`**.

## Global Constraints

- **Drizzle is the sole migration authority** (`packages/db/CLAUDE.md`). DDL = hand-authored SQL in `packages/db/migrations/`. **Never** `supabase/migrations/`, `supabase migration new`, or `supabase db diff`.
- **`db:generate:dev` is broken** (ESM resolution). Author `0009` by hand, hand-append the `meta/_journal.json` entry, and create **no** snapshot file — mirror the `0007`/`0008` precedent.
- **Only revoke from `anon`, `authenticated`.** Keep `service_role` grants intact (it has `BYPASSRLS` and backs the admin client). Keep all existing RLS policies (defense-in-depth; C2 rescopes them).
- **Backend bypasses RLS.** `DATABASE_URL` connects as `postgres` (`rolbypassrls = true`, verified in prod). Enabling RLS / revoking anon grants never blocks api/worker/agent. The RAG table `module_content_chunks` is written by the worker as `postgres`; the checkpoint tables are created + used by the agent as `postgres`.
- **Root cause of the open grants (verified via `pg_default_acl`):** a `postgres`-owned default-privilege entry grants `ALL` on new `public` objects to `anon`/`authenticated`/`service_role`. Our app **and** LangGraph create tables as `postgres`, so revoking **postgres's** default privileges (the implicit `FOR ROLE` of an `ALTER DEFAULT PRIVILEGES` run as `postgres`) covers every table we create, including runtime checkpoint tables. The separate `supabase_admin`-owned default-ACL entry governs only tables *it* creates (not ours) and is not alterable by the non-superuser `postgres` role — leave it alone.
- **Checkpoint tables are created at runtime**, not by a migration: `PostgresSaver.setup()` runs in `PostgresCheckpointerProvider.init()` (`packages/providers/src/implementations/checkpointer/postgres.provider.ts`), called from `services/agent/src/main.ts` when `CHECKPOINTER=postgres`. A migration cannot `ALTER` them on a fresh DB where they do not yet exist — hence the hybrid (conditional migration + app-code enable).
- **Test/verify env workaround** (this shell shadows `.env.dev`): prefix package test runs with `env -u DATABASE_URL -u SUPABASE_URL -u QUEUE_PROVIDER`.

---

### Task 1: Migration `0009_data_api_lockdown.sql`

**Files:**
- Create: `packages/db/migrations/0009_data_api_lockdown.sql`
- Modify: `packages/db/migrations/meta/_journal.json` (append entry; **no** snapshot file)

**Interfaces:**
- Produces: revoked `anon`/`authenticated` privileges on all current + future `public` tables/sequences; RLS enabled on `module_content_chunks` and (conditionally) the 4 checkpoint tables.

- [ ] **Step 1: Author the migration SQL**

Create `packages/db/migrations/0009_data_api_lockdown.sql`:

```sql
-- 0009_data_api_lockdown.sql
-- Spec 2 (production-auth) Phase 2 / D3 — close the PostgREST Data API for the publishable key.
-- Backend services connect as `postgres` (BYPASSRLS); revoked grants + RLS protect only the
-- client surface. service_role grants are intentionally retained (admin client).

-- 1. Revoke privileges on all CURRENT public objects from the PostgREST roles.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- 2. Stop FUTURE objects (incl. runtime-created checkpoint tables) from being re-granted.
--    Root cause = postgres-owned pg_default_acl entry. Our app + LangGraph create tables as
--    postgres, so revoking postgres's default privileges (the implicit FOR ROLE) covers them.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- 3. Enable RLS on the Drizzle-owned table missed by 0003/0004 (no policy = deny-all;
--    the worker writes it as postgres/BYPASSRLS).
ALTER TABLE public.module_content_chunks ENABLE ROW LEVEL SECURITY;

-- 4. Enable RLS on the 4 LangGraph checkpoint tables IF they already exist (prod/warm DBs).
--    On a fresh DB they don't exist yet -> the agent checkpointer init() enables RLS after setup().
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['checkpoints','checkpoint_writes','checkpoint_blobs','checkpoint_migrations']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;
```

- [ ] **Step 2: Register the migration in the journal**

Append to the `entries` array in `packages/db/migrations/meta/_journal.json` (after the `0008` entry, `idx:7`). Use a `when` strictly greater than `0008`'s `1782100000000`:

```json
{ "idx": 8, "version": "7", "when": 1782200000000, "tag": "0009_data_api_lockdown", "breakpoints": true }
```

Do **not** create a `meta/0009_snapshot.json` (hand-authored migrations have no snapshot; matches `0007`/`0008`).

- [ ] **Step 3: Verify the files**

```bash
test -f packages/db/migrations/0009_data_api_lockdown.sql && echo "sql ok"
grep -q '0009_data_api_lockdown' packages/db/migrations/meta/_journal.json && echo "journal ok"
```
Expected: both `ok`. Dry-review the SQL once more before applying anywhere.

---

### Task 2: Checkpointer enables RLS on its runtime tables (fresh-DB half of the hybrid)

**Files:**
- Modify: `packages/providers/src/implementations/checkpointer/postgres.provider.ts`
- Test: `packages/providers/src/implementations/checkpointer/__tests__/postgres.provider.integration.test.ts` (confirm the existing checkpointer test location/name first; mirror it. If only a unit test exists, add a Postgres-backed integration test guarded the same way other provider integration tests are.)

**Interfaces:**
- Consumes: the `PostgresSaver` pool (already used by `ping()`).
- Produces: after `init()`, RLS is enabled on `checkpoints`, `checkpoint_writes`, `checkpoint_blobs`, `checkpoint_migrations` (idempotent on every boot).

- [ ] **Step 1: Write the failing integration test**

Add a test that, against the local stack with `CHECKPOINTER=postgres`, calls `init()` then asserts `relrowsecurity = true` for all 4 tables. Mirror the existing provider test's setup (connection string, skip-guard). Sketch:

```typescript
it('enables RLS on the checkpoint tables it creates', async () => {
  const provider = new PostgresCheckpointerProvider({ connectionString: TEST_DATABASE_URL });
  await provider.init();
  const pool = (provider as unknown as { saver: { pool: { query(s: string): Promise<{ rows: Array<{ relname: string; relrowsecurity: boolean }> }> } } }).saver.pool;
  const { rows } = await pool.query(
    `select relname, relrowsecurity from pg_class
     where relname in ('checkpoints','checkpoint_writes','checkpoint_blobs','checkpoint_migrations')`,
  );
  expect(rows).toHaveLength(4);
  for (const r of rows) expect(r.relrowsecurity).toBe(true);
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `env -u DATABASE_URL -u SUPABASE_URL -u QUEUE_PROVIDER pnpm --filter @autodidact/providers test postgres.provider`
Expected: FAIL — RLS is `false` (library `setup()` does not enable it).

- [ ] **Step 3: Implement — enable RLS after `setup()`**

In `postgres.provider.ts`, add a module-level constant and extend `init()` after the existing `await (this.saver …).setup()`:

```typescript
// Single source of truth for the tables PostgresSaver.setup() creates.
const CHECKPOINT_TABLES = [
  'checkpoints',
  'checkpoint_writes',
  'checkpoint_blobs',
  'checkpoint_migrations',
] as const;
```

```typescript
  async init(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import('@langchain/langgraph-checkpoint-postgres' as any);
    const PostgresSaver = mod.PostgresSaver ?? mod.default?.PostgresSaver;
    this.saver = PostgresSaver.fromConnString(this.connectionString);
    await (this.saver as unknown as { setup(): Promise<void> }).setup();

    // Lock down the checkpoint tables the library just created: deny PostgREST
    // (anon/authenticated) access via RLS. The backend connects as postgres (BYPASSRLS),
    // so this never blocks the agent. Idempotent on every boot; mirrors migration 0009's
    // conditional enablement for fresh DBs where these tables didn't exist at migrate time.
    // Fixed whitelist -> safe to interpolate the identifier.
    const pool = (this.saver as unknown as {
      pool?: { query(sql: string): Promise<unknown> };
    }).pool;
    if (pool?.query) {
      for (const t of CHECKPOINT_TABLES) {
        await pool.query(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
      }
    }
  }
```

- [ ] **Step 4: Run the test to confirm it passes + no regression**

Run: `env -u DATABASE_URL -u SUPABASE_URL -u QUEUE_PROVIDER pnpm --filter @autodidact/providers test`
Expected: the new test PASSES; the `MemoryCheckpointerProvider` path is unchanged (no DDL when `CHECKPOINTER` is unset/`memory`); `ping()` still works.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter @autodidact/providers typecheck
git add packages/providers/src/implementations/checkpointer/postgres.provider.ts \
        packages/providers/src/implementations/checkpointer/__tests__/postgres.provider.integration.test.ts \
        packages/db/migrations/0009_data_api_lockdown.sql \
        packages/db/migrations/meta/_journal.json
git commit -m "feat(db,providers): data-API lockdown — revoke anon grants + enable RLS, checkpoint hybrid (Spec 2 C1)"
```

---

### Task 3: Apply locally + verify the lockdown

**Files:** none (operational).

- [ ] **Step 1: Apply the migration to the local stack**

Run: `pnpm migrate:dev`
Expected: `0009` applies clean (the `DO` block is a no-op if the checkpoint tables don't exist yet locally).

- [ ] **Step 2: Boot the agent so the checkpoint tables exist + get locked**

Start the agent with `CHECKPOINTER=postgres` (e.g. via `pnpm dev`, or the agent alone). On boot, `init()` creates the 4 checkpoint tables and enables RLS on them.

- [ ] **Step 3: Confirm RLS + revoked grants in the DB**

```bash
PGURL=postgresql://postgres:postgres@127.0.0.1:55322/postgres
psql "$PGURL" -c "select relname, relrowsecurity from pg_class where relkind='r' and relnamespace='public'::regnamespace order by relname;"
psql "$PGURL" -c "select grantee, count(*) from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') group by grantee;"
```
Expected: every public table shows `relrowsecurity = t`; the grants query returns **no rows** for `anon`/`authenticated` (zero table grants).

- [ ] **Step 4: Negative + positive functional checks**
- [ ] With the **publishable key**, a PostgREST read (e.g. `GET <SUPABASE_URL>/rest/v1/courses`) returns permission-denied / empty.
- [ ] GoTrue still works: a signup/login round-trip against the local stack succeeds.
- [ ] Backend intact: api/worker/agent (via `postgres`) still read/write courses, `module_content_chunks` (RAG), and checkpoints. Run `env -u DATABASE_URL -u SUPABASE_URL -u QUEUE_PROVIDER pnpm test` and confirm api/worker/agent/providers suites stay green.

- [ ] **Step 5: Advisor check (local)**

Use Supabase MCP `get_advisors(type: security)` against the local project (or `supabase` CLI lint).
Expected: **zero** `rls_disabled_in_public` findings.

---

### Task 4: Apply to prod + verify

**Files:** none (operational). **Prod project:** `cbzdsoojfhpsexuyeyxt`.

- [ ] **Step 1: Dry-review, then apply `0009` to prod**

**Primary:** `pnpm migrate:prod` after confirming `.env.prod` `DATABASE_URL` (session pooler, port 6543) authenticates. drizzle-kit sees id 1–8 applied and runs only `0009`.

**Fallback (Plan A's proven path — `.env.prod` pooler auth was stale there):** apply the SQL via Supabase MCP `apply_migration` (name `0009_data_api_lockdown`), then hand-sync the journal row so a later `migrate:prod` won't re-run it:

```bash
shasum -a 256 packages/db/migrations/0009_data_api_lockdown.sql   # -> <hash9>
```
```sql
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
VALUES ('<hash9>', 1782200000000);
```
(`hash` = sha256 of the exact `.sql` file bytes; `created_at` = the journal `when`.)

- [ ] **Step 2: Confirm checkpoint tables locked in prod**

The 4 checkpoint tables already exist in prod, so `0009`'s `DO` block enabled RLS on them at apply time. Verify via MCP `execute_sql`:
```sql
select relname, relrowsecurity from pg_class
where relname in ('checkpoints','checkpoint_writes','checkpoint_blobs','checkpoint_migrations','module_content_chunks');
```
Expected: all `relrowsecurity = true`.

- [ ] **Step 3: Advisor + smoke check (prod)**
- [ ] MCP `get_advisors(type: security)` → the 5 `rls_disabled_in_public` errors are **cleared**.
- [ ] Real signup + login still succeed (GoTrue unaffected). A throwaway anon-key REST read is blocked. Clean up the throwaway user.
- [ ] Confirm `drizzle.__drizzle_migrations` now has id 9.

---

### Task 5: Docs

**Files:**
- Modify: `packages/db/CLAUDE.md` (or `packages/db/README.md`) — note the Data-API posture.
- Modify: `docs/superpowers/plans/README.md` — index row for C1.
- Modify: `docs/architecture/ADRs/` ADR-028 — short note (or defer the ADR touch to C2's combined update; pick one and state it).

- [ ] **Step 1: Record the posture**

Add a short note where DB security is described: "The PostgREST Data API is closed for `anon`/`authenticated` (migration `0009`, Spec 2 C1); backend connects as `postgres`/BYPASSRLS; RLS is defense-in-depth. Checkpoint tables (created at runtime) are locked by the checkpointer's `init()` + default-privilege revoke." Link to the spec.

- [ ] **Step 2: Update the plans index**

Add the C1 row to `docs/superpowers/plans/README.md` (Spec 2/4, Phase 2 / D3).

- [ ] **Step 3: Commit**

```bash
git add packages/db/CLAUDE.md docs/superpowers/plans/README.md docs/architecture/ADRs/
git commit -m "docs: record Data-API lockdown posture + index Plan C1 (Spec 2)"
```

---

## Verification (end-to-end, Plan C1)

```bash
pnpm migrate:dev                                                                 # 0009 applies
env -u DATABASE_URL -u SUPABASE_URL -u QUEUE_PROVIDER pnpm --filter @autodidact/providers test   # checkpointer RLS test green
env -u DATABASE_URL -u SUPABASE_URL -u QUEUE_PROVIDER pnpm test                   # api/worker/agent unaffected
# DB: every public table relrowsecurity=t; zero anon/authenticated table grants
# MCP get_advisors(security): zero rls_disabled_in_public (local AND prod)
# anon publishable-key REST read blocked; GoTrue login works; backend CRUD + RAG + checkpoints work
```

**Done when:** `0009` applied to local **and** prod (`drizzle.__drizzle_migrations` id 9 synced); the security advisor reports zero `rls_disabled_in_public` on both; the publishable key cannot read or write any `public` table while GoTrue auth and all backend services keep working; the checkpointer enables RLS on its runtime tables on every boot (test-covered).

## Self-review notes (spec coverage)

- **Phase 2 / D3 mapped:** revoke `anon`/`authenticated` on all public tables (+ sequences) → `0009` steps 1–2; root-cause fix (stop re-granting) → `ALTER DEFAULT PRIVILEGES` for the `postgres` default ACL (verified via `pg_default_acl`); enable RLS on the 5 disabled tables → step 3 (`module_content_chunks`) + step 4 (conditional checkpoint) + Task 2 (runtime checkpoint enable); keep policies as defense-in-depth → untouched (C2 rescopes).
- **Checkpoint-at-runtime resolved (hybrid, user-approved):** conditional migration covers prod/warm DBs; checkpointer `init()` covers fresh DBs; the default-privilege revoke is the actual lock (works regardless of table existence), RLS-enable clears the advisor + adds depth.
- **Deliberate scope:** `service_role` grants retained; functions left alone (`is_anonymous()` is used by RLS; the two provisioning fns were already locked in `0008`); no sequence grants exist today (UUID PKs) so those revokes are hygiene; the `supabase_admin` default-ACL is out of scope (governs only its own tables, not alterable by `postgres`).
- **Deferred to C2:** policy `TO authenticated` rescoping (D4′) and all GoTrue `config.toml` hardening incl. MFA.
