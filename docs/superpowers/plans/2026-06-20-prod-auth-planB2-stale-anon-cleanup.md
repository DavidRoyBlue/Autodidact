# Production Auth (Spec 2) — Plan B2: Stale-Anonymous Cleanup Job (Phase 1e)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the worker a `cleanup-stale-anonymous` task that deletes anonymous users older than the retention window (90 days) — `public.users` first (cascading to enrollments/module_progress/chat_sessions via Plan A's `ON DELETE CASCADE`), then `auth.users` — so guest accounts don't accumulate forever.

**Architecture:** A new pure processor `processStaleAnonymousCleanup(data, deps)` plus a `POST /tasks/cleanup-stale-anonymous` Fastify route on the worker, mirroring the existing `generate-course`/`generate-embedding` pattern (validate body → call processor → 2xx/5xx contract). The processor runs as the `postgres` role via `getDb()` (BYPASSRLS), deletes in dependency order, and returns the count removed. The recurring **trigger** (Cloud Scheduler → Cloud Tasks) is infra/Terraform and is **deferred** — B2 delivers the endpoint + processor, fully integration-tested against a real Postgres; in dev the task is invoked by a manual POST.

**Tech Stack:** Fastify (worker HTTP), Drizzle + `@autodidact/db` (`getDb`, `sql`, `eq`, `and`, `lt`), `@autodidact/schemas` (Zod payload validation), `@autodidact/types`, Vitest + `@autodidact/test-support` Testcontainers (real Postgres).

**Source spec:** `docs/superpowers/specs/2026-06-18-production-auth-design.md` (Spec 2), part **1e** (stale-anonymous cleanup). This is **Plan B2**; the mobile anonymous flow is **Plan B1**. Builds on **Plan A** (the `ON DELETE CASCADE` on user FKs — `0006` — that makes the ordered delete correct; the `is_anonymous` column).

## Global Constraints

- **Scheduler decision (spec 1e):** cleanup runs via **the worker (Cloud Tasks)**, **NOT pg_cron** (pg_cron may not run under local `supabase start` → untestable; the worker keeps infra consistent and testable). B2 builds the worker endpoint + processor; the Cloud Scheduler/Terraform wiring is a **deferred infra task** (per the plan decision — endpoint + processor only).
- **Deletion order (spec 1e):** delete `public.users` FIRST — which cascades to `enrollments`/`module_progress`/`chat_sessions` via the `ON DELETE CASCADE` added in Plan A (`0006`) — THEN delete the `auth.users` row. `public.users` has no FK to `auth.users`, so the `auth.users` delete is a separate explicit step.
- **Retention window N = 90 days** (plan parameter). The payload carries `retentionDays` (optional; the worker defaults it to 90). "Stale" = `is_anonymous = true AND created_at < now() - N days`.
- **Worker invariants (`services/worker/CLAUDE.md`):** HTTP surface is the task contract only (`/tasks/:name` + `/health`); processors are pure `process*(data, deps)` functions in `src/processors/` (no transport coupling); validate every task body with `@autodidact/schemas`; response codes drive queue behaviour (`2xx` ack, `5xx` retry); use `@autodidact/db` (`getDb`) — never raw `pg`; log via `@autodidact/observability` (never `console.log`).
- **Types vs schemas split:** payload **types** go in `@autodidact/types` (`src/jobs.ts`, no runtime code); **Zod schemas** go in `@autodidact/schemas` (`src/jobs.ts`). Keep the two shapes mirrored (existing convention).
- **Test runner = Vitest** via `@autodidact/test-support` (Testcontainers real Postgres). The harness applies all migrations incl. `0006`/`0007` and stubs `auth.users` + the Supabase roles (Plan A). Run with the stale-env workaround: `env -u DATABASE_URL -u SUPABASE_URL -u QUEUE_PROVIDER pnpm --filter <pkg> test`.

---

### Task 1: Cleanup job payload — type + schema

**Files:**
- Modify: `packages/types/src/jobs.ts`
- Modify: `packages/schemas/src/jobs.ts`
- Test: `packages/schemas/src/__tests__/jobs.test.ts` (create if absent; check `packages/schemas/src/__tests__/` and follow the existing schema-test pattern)

**Interfaces:**
- Produces: `StaleAnonymousCleanupJobData { retentionDays?: number }` (type); `StaleAnonymousCleanupJobSchema` = `z.object({ retentionDays: z.number().int().positive().optional() })` + inferred `StaleAnonymousCleanupJobInput`. Both exported via the existing `index.ts` `export * from './jobs.js'`.

- [ ] **Step 1: Write the failing schema test**

Create/extend `packages/schemas/src/__tests__/jobs.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { StaleAnonymousCleanupJobSchema } from '../jobs.js';

describe('StaleAnonymousCleanupJobSchema', () => {
  it('accepts an empty object (retentionDays optional)', () => {
    expect(StaleAnonymousCleanupJobSchema.parse({})).toEqual({});
  });
  it('accepts a positive integer retentionDays', () => {
    expect(StaleAnonymousCleanupJobSchema.parse({ retentionDays: 90 })).toEqual({ retentionDays: 90 });
  });
  it('rejects zero / negative / non-integer', () => {
    expect(StaleAnonymousCleanupJobSchema.safeParse({ retentionDays: 0 }).success).toBe(false);
    expect(StaleAnonymousCleanupJobSchema.safeParse({ retentionDays: -1 }).success).toBe(false);
    expect(StaleAnonymousCleanupJobSchema.safeParse({ retentionDays: 1.5 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `env -u DATABASE_URL -u SUPABASE_URL -u QUEUE_PROVIDER pnpm --filter @autodidact/schemas test jobs`
Expected: FAIL — `StaleAnonymousCleanupJobSchema` is undefined.

- [ ] **Step 3: Add the type**

In `packages/types/src/jobs.ts`, append:

```typescript
export interface StaleAnonymousCleanupJobData {
  /** Delete anonymous users created more than this many days ago. Worker defaults to 90. */
  retentionDays?: number;
}
```

- [ ] **Step 4: Add the schema**

In `packages/schemas/src/jobs.ts`, append:

```typescript
export const StaleAnonymousCleanupJobSchema = z.object({
  retentionDays: z.number().int().positive().optional(),
});

export type StaleAnonymousCleanupJobInput = z.infer<typeof StaleAnonymousCleanupJobSchema>;
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `env -u DATABASE_URL -u SUPABASE_URL -u QUEUE_PROVIDER pnpm --filter @autodidact/schemas test jobs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/jobs.ts packages/schemas/src/jobs.ts packages/schemas/src/__tests__/jobs.test.ts
git commit -m "feat(schemas): StaleAnonymousCleanup job type + schema (Spec 2 B2)"
```

---

### Task 2: Task-name constant

**Files:**
- Modify: `services/worker/src/queues/definitions.ts`

**Interfaces:**
- Produces: `JOB_NAMES.CLEANUP_STALE_ANONYMOUS = 'cleanup-stale-anonymous'` (the URL path segment for the route). No new `QUEUES` entry is needed — the cleanup is triggered by Cloud Scheduler hitting the route directly, not enqueued by another service.

- [ ] **Step 1: Add the job-name constant**

In `services/worker/src/queues/definitions.ts`, add to `JOB_NAMES`:

```typescript
export const JOB_NAMES = {
  GENERATE_COURSE: 'generate-course',
  GENERATE_EMBEDDING: 'generate-embedding',
  CLEANUP_STALE_ANONYMOUS: 'cleanup-stale-anonymous',
} as const;
```

(Leave `QUEUES` unchanged. The `services/api` copy of `definitions.ts` does **not** need this constant — the API never enqueues cleanup; adding it there would be unused.)

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @autodidact/worker typecheck`
Expected: passes (the `as const` keeps `JobName` a literal union).

- [ ] **Step 3: Commit**

```bash
git add services/worker/src/queues/definitions.ts
git commit -m "feat(worker): add cleanup-stale-anonymous job name (Spec 2 B2)"
```

---

### Task 3: The cleanup processor (ordered delete, integration-tested)

**Files:**
- Create: `services/worker/src/processors/stale-anonymous-cleanup.processor.ts`
- Test: `services/worker/src/__tests__/stale-anonymous-cleanup.processor.integration.test.ts` (confirm the worker test dir + how existing worker integration tests use `withTestDatabase` — follow that pattern)

**Interfaces:**
- Consumes: `StaleAnonymousCleanupJobData` (Task 1); `getDb`, `sql` from `@autodidact/db`; `Logger`.
- Produces: `processStaleAnonymousCleanup(data: StaleAnonymousCleanupJobData, deps: { logger: Logger }): Promise<{ deleted: number }>` — deletes stale anonymous users (`public.users` first → cascades, then `auth.users`) and returns the count. `DEFAULT_RETENTION_DAYS = 90`.

- [ ] **Step 1: Write the failing integration test**

Create `services/worker/src/__tests__/stale-anonymous-cleanup.processor.integration.test.ts`. It seeds, via the harness pool, an OLD anonymous user (with a dependent enrollment), a RECENT anonymous user, and a real user, then asserts only the old anonymous one (and its dependents) is removed from both tables:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { withTestDatabase } from '@autodidact/test-support';
import { processStaleAnonymousCleanup } from '../processors/stale-anonymous-cleanup.processor.js';

const silentLogger = { info() {}, warn() {}, error() {}, debug() {}, child() { return silentLogger; } } as never;

describe('processStaleAnonymousCleanup', () => {
  let h: Awaited<ReturnType<typeof withTestDatabase>>;
  beforeAll(async () => { h = await withTestDatabase(); }, 90_000);
  afterAll(async () => { await h.close(); });
  beforeEach(async () => { await h.truncate(); await h.pool.query('delete from auth.users'); });

  async function seedUser(isAnon: boolean, ageDays: number, email: string | null): Promise<string> {
    const { rows } = await h.pool.query(
      `insert into auth.users (email, is_anonymous) values ($1, $2) returning id`,
      [email, isAnon],
    );
    const id = rows[0].id as string;
    // The provisioning trigger created public.users; backdate created_at to simulate age.
    await h.pool.query(
      `update public.users set created_at = now() - ($1 || ' days')::interval where id = $2`,
      [String(ageDays), id],
    );
    return id;
  }

  it('deletes only anonymous users older than the retention window, cascading dependents', async () => {
    const oldAnon = await seedUser(true, 120, null);
    const recentAnon = await seedUser(true, 10, null);
    const oldReal = await seedUser(false, 200, 'real@test.dev');

    // a dependent row that must cascade-delete with oldAnon
    const course = await h.pool.query(
      `insert into courses (topic, generated_by, status, is_public) values ('t', $1, 'ready', false) returning id`,
      [oldReal],
    );
    await h.pool.query(`insert into enrollments (user_id, course_id) values ($1, $2)`, [oldAnon, course.rows[0].id]);

    const result = await processStaleAnonymousCleanup({ retentionDays: 90 }, { logger: silentLogger });

    expect(result.deleted).toBe(1);
    // oldAnon gone from both tables; its enrollment cascade-deleted
    expect((await h.pool.query(`select 1 from public.users where id=$1`, [oldAnon])).rowCount).toBe(0);
    expect((await h.pool.query(`select 1 from auth.users where id=$1`, [oldAnon])).rowCount).toBe(0);
    expect((await h.pool.query(`select 1 from enrollments where user_id=$1`, [oldAnon])).rowCount).toBe(0);
    // recent anon + real user retained
    expect((await h.pool.query(`select 1 from public.users where id=$1`, [recentAnon])).rowCount).toBe(1);
    expect((await h.pool.query(`select 1 from public.users where id=$1`, [oldReal])).rowCount).toBe(1);
  });

  it('defaults the retention window to 90 days when omitted', async () => {
    const oldAnon = await seedUser(true, 100, null);
    const result = await processStaleAnonymousCleanup({}, { logger: silentLogger });
    expect(result.deleted).toBe(1);
    expect((await h.pool.query(`select 1 from auth.users where id=$1`, [oldAnon])).rowCount).toBe(0);
  });
});
```

> Confirm the `courses` insert columns against `packages/db/src/schema/courses.ts` before relying on them — adjust the seed insert to match the actual NOT NULL columns (e.g. `topic`, `generated_by`, `status`, `is_public`). The point is a dependent row that cascades; use the minimal valid course shape.

- [ ] **Step 2: Run the test to confirm it fails**

Run: `env -u DATABASE_URL -u SUPABASE_URL -u QUEUE_PROVIDER pnpm --filter @autodidact/worker test stale-anonymous-cleanup`
Expected: FAIL — processor module does not exist.

- [ ] **Step 3: Implement the processor**

Create `services/worker/src/processors/stale-anonymous-cleanup.processor.ts`:

```typescript
import { sql, getDb } from '@autodidact/db';
import type { StaleAnonymousCleanupJobData } from '@autodidact/types';
import type { Logger } from '@autodidact/observability';

export const DEFAULT_RETENTION_DAYS = 90;

export interface StaleAnonymousCleanupDeps {
  logger: Logger;
}

/**
 * Deletes anonymous users created more than `retentionDays` ago (default 90).
 * Order matters (spec 1e): delete public.users FIRST — cascading to
 * enrollments / module_progress / chat_sessions via the ON DELETE CASCADE FKs
 * (migration 0006) — THEN delete the auth.users rows (no FK links the two, so
 * it is a separate explicit step). Runs as the postgres role (BYPASSRLS) via
 * getDb(). Idempotent: re-running deletes whatever is now stale.
 */
export async function processStaleAnonymousCleanup(
  data: StaleAnonymousCleanupJobData,
  { logger }: StaleAnonymousCleanupDeps,
): Promise<{ deleted: number }> {
  const retentionDays = data.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const db = getDb();
  const cutoff = sql`now() - (${String(retentionDays)} || ' days')::interval`;

  // Collect the stale anonymous ids once, then delete from both tables in order.
  const stale = await db.execute(
    sql`select id from public.users where is_anonymous = true and created_at < ${cutoff}`,
  );
  const ids = (stale.rows as Array<{ id: string }>).map((r) => r.id);
  if (ids.length === 0) {
    logger.info({ retentionDays }, 'Stale-anonymous cleanup: nothing to delete');
    return { deleted: 0 };
  }

  // 1. public.users — cascades to enrollments/module_progress/chat_sessions (0006).
  await db.execute(sql`delete from public.users where id in ${sql.raw('(' + ids.map((id) => `'${id}'`).join(',') + ')')}`);
  // 2. auth.users — separate explicit delete (no FK from public.users to auth.users).
  await db.execute(sql`delete from auth.users where id in ${sql.raw('(' + ids.map((id) => `'${id}'`).join(',') + ')')}`);

  logger.info({ retentionDays, deleted: ids.length }, 'Stale-anonymous cleanup complete');
  return { deleted: ids.length };
}
```

> The ids come from a `uuid` column (server-generated), so the inline `sql.raw` list is safe here — but if a reviewer prefers parameterization, use `inArray(users.id, ids)` from Drizzle for the `public.users` delete and a parameterized `db.execute` for `auth.users`. Either is acceptable; keep it consistent and never interpolate untrusted strings.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `env -u DATABASE_URL -u SUPABASE_URL -u QUEUE_PROVIDER pnpm --filter @autodidact/worker test stale-anonymous-cleanup`
Expected: PASS — old anonymous deleted from both tables with its enrollment cascaded; recent anon + real user retained; default-90 case deletes the 100-day-old guest.

- [ ] **Step 5: Commit**

```bash
git add services/worker/src/processors/stale-anonymous-cleanup.processor.ts services/worker/src/__tests__/stale-anonymous-cleanup.processor.integration.test.ts
git commit -m "feat(worker): stale-anonymous cleanup processor (ordered cascade delete) (Spec 2 B2)"
```

---

### Task 4: The `/tasks/cleanup-stale-anonymous` route

**Files:**
- Modify: `services/worker/src/app.ts`
- Test: `services/worker/src/__tests__/app.test.ts` (or wherever the worker route tests live — find the existing route test for `generate-embedding` and mirror it; if routes are only covered by an integration test, add a focused route test there)

**Interfaces:**
- Consumes: `processStaleAnonymousCleanup` (Task 3), `StaleAnonymousCleanupJobSchema` (Task 1), `JOB_NAMES.CLEANUP_STALE_ANONYMOUS` (Task 2).
- Produces: `POST /tasks/cleanup-stale-anonymous` — validates the body (400 on invalid), runs the processor, returns `200 { deleted }` on success, `500` on failure (so Cloud Tasks retries; cleanup is idempotent, so retry is safe — no course-style "final attempt" handling needed).

- [ ] **Step 1: Write the failing route test**

In the worker route test file, add a case. Mock the processor so the route is tested in isolation (mirror how existing route tests inject deps / mock processors — adjust to the file's actual style):

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../processors/stale-anonymous-cleanup.processor.js', () => ({
  processStaleAnonymousCleanup: vi.fn().mockResolvedValue({ deleted: 3 }),
}));

// ... build the app with test deps (mirror the existing buildApp(testDeps) setup in this file) ...

it('POST /tasks/cleanup-stale-anonymous returns 200 with the deleted count', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/tasks/cleanup-stale-anonymous',
    payload: { retentionDays: 90 },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ deleted: 3 });
});

it('POST /tasks/cleanup-stale-anonymous rejects an invalid payload with 400', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/tasks/cleanup-stale-anonymous',
    payload: { retentionDays: -5 },
  });
  expect(res.statusCode).toBe(400);
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `env -u DATABASE_URL -u SUPABASE_URL -u QUEUE_PROVIDER pnpm --filter @autodidact/worker test app`
Expected: FAIL — route returns 404 (not registered).

- [ ] **Step 3: Add the route**

In `services/worker/src/app.ts`: import the schema, the processor, and use the new job name. Add the route alongside the existing ones (after the embedding route, inside `buildApp`):

```typescript
import { StaleAnonymousCleanupJobSchema } from '@autodidact/schemas';
import { processStaleAnonymousCleanup } from './processors/stale-anonymous-cleanup.processor.js';
// JOB_NAMES is already imported
```

```typescript
  app.post(`/tasks/${JOB_NAMES.CLEANUP_STALE_ANONYMOUS}`, async (req, reply) => {
    const parsed = StaleAnonymousCleanupJobSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      logger.error({ issues: parsed.error.issues }, 'Invalid cleanup-stale-anonymous payload');
      return reply.code(400).send({ error: 'invalid payload' });
    }
    try {
      const result = await processStaleAnonymousCleanup(parsed.data, { logger });
      return await reply.code(200).send(result);
    } catch (err) {
      logger.error({ err }, 'Stale-anonymous cleanup task failed');
      // Idempotent — let Cloud Tasks retry. No course-style final-attempt handling.
      return reply.code(500).send({ error: 'task failed' });
    }
  });
```

- [ ] **Step 4: Run the test + full worker suite**

Run: `env -u DATABASE_URL -u SUPABASE_URL -u QUEUE_PROVIDER pnpm --filter @autodidact/worker test`
Expected: the new route tests PASS and no existing worker tests regress.

- [ ] **Step 5: Commit**

```bash
git add services/worker/src/app.ts services/worker/src/__tests__/app.test.ts
git commit -m "feat(worker): POST /tasks/cleanup-stale-anonymous route (Spec 2 B2)"
```

---

### Task 5: Local end-to-end verification (manual dispatch)

**Files:** none. **Precondition:** local stack up + worker running (`pnpm dev`), or run the worker alone. The worker listens on `:3002`.

- [ ] **Step 1: Seed a stale anonymous user on the local stack**

```bash
PGURL=postgresql://postgres:postgres@127.0.0.1:55322/postgres
ID=$(psql "$PGURL" -tA -c "insert into auth.users (email, is_anonymous) values (NULL, true) returning id;")
psql "$PGURL" -c "update public.users set created_at = now() - interval '120 days' where id = '$ID';"
echo "seeded stale guest: $ID"
psql "$PGURL" -c "select id, is_anonymous, created_at from public.users where id='$ID';"
```
Expected: a `public.users` row (provisioned by the Plan A trigger), `is_anonymous=true`, `created_at` 120 days ago.

- [ ] **Step 2: Invoke the cleanup task (loopback / direct POST)**

```bash
curl -s -X POST "http://localhost:3002/tasks/cleanup-stale-anonymous" \
  -H "Content-Type: application/json" -d '{"retentionDays":90}'
echo
```
Expected: `{"deleted":1}` (or higher if other stale guests exist).

- [ ] **Step 3: Confirm the ordered cascade delete**

```bash
PGURL=postgresql://postgres:postgres@127.0.0.1:55322/postgres
psql "$PGURL" -c "select count(*) as still_in_public from public.users where id='$ID';"
psql "$PGURL" -c "select count(*) as still_in_auth from auth.users where id='$ID';"
```
Expected: both counts `0` — removed from `public.users` (cascading any dependents) and from `auth.users`.

---

### Task 6: Docs — new worker task + deferred scheduling

**Files:**
- Modify: `services/worker/CLAUDE.md`
- Modify: `services/worker/README.md` (if present; otherwise the CLAUDE.md task list)
- Modify: `services/worker/src/processors/CLAUDE.md` (processor table)

- [ ] **Step 1: Document the new task**

Add `cleanup-stale-anonymous` to the worker's task list in `services/worker/CLAUDE.md` (purpose: deletes anonymous users older than the retention window; ordered delete `public.users`→cascade→`auth.users`; idempotent; `2xx` ack / `5xx` retry). Add a row to the processor table in `services/worker/src/processors/CLAUDE.md` (`stale-anonymous-cleanup.processor.ts` → `processStaleAnonymousCleanup` → `POST /tasks/cleanup-stale-anonymous`). Note explicitly that the **recurring schedule (Cloud Scheduler → Cloud Tasks) is deferred to an infra task** — B2 ships only the endpoint + processor; in dev it's invoked by a manual POST.

- [ ] **Step 2: Verify no contradiction**

Run: `grep -rn "cleanup-stale-anonymous\|StaleAnonymous" services/worker/CLAUDE.md services/worker/src/processors/CLAUDE.md`
Expected: the new task appears in both.

- [ ] **Step 3: Commit**

```bash
git add services/worker/CLAUDE.md services/worker/src/processors/CLAUDE.md
git commit -m "docs(worker): document stale-anonymous cleanup task + deferred scheduling (Spec 2 B2)"
```

---

## Verification (end-to-end, Plan B2)

```bash
env -u DATABASE_URL -u SUPABASE_URL -u QUEUE_PROVIDER pnpm --filter @autodidact/schemas test     # job schema green
env -u DATABASE_URL -u SUPABASE_URL -u QUEUE_PROVIDER pnpm --filter @autodidact/worker test      # processor + route green
pnpm --filter @autodidact/worker typecheck
# Manual (Task 5): seed a 120-day-old guest → POST /tasks/cleanup-stale-anonymous → {"deleted":1};
# the row is gone from BOTH public.users (dependents cascaded) and auth.users.
```

**Done when:** `processStaleAnonymousCleanup` deletes only anonymous users older than the retention window (default 90), removing `public.users` first (dependents cascade via `0006`) then `auth.users`, and returns the count; the `POST /tasks/cleanup-stale-anonymous` route validates input and follows the 2xx/5xx contract; integration + route tests pass; the deferred Cloud Scheduler wiring is documented as a follow-up.

## Self-review notes (spec coverage)

- 1e scheduler = worker (not pg_cron) → route + processor (Tasks 2–4). 1e ordered cascade delete (`public.users`→dependents→`auth.users`) → Task 3 (relies on Plan A `0006` cascades). Retention N=90 (plan parameter) → default in Task 3, payload in Task 1.
- **Deferred by design:** the recurring **Cloud Scheduler → Cloud Tasks** trigger (Terraform/`infra/`) — B2 delivers the worker endpoint + processor only; the prod schedule is a separate infra task.
