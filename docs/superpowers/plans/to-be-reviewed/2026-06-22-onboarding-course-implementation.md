# Onboarding Course "Welcome to Autodidact" + Auto-Enroll — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`../../specs/to-be-reviewed/2026-06-19-onboarding-course-design.md`](../../specs/to-be-reviewed/2026-06-19-onboarding-course-design.md) (Spec 3 of 4). Read it first — this plan implements the **mechanism against a placeholder course**; the real curated content is a separate later product task (spec D2).

**Goal:** Every new user (real or anonymous) is auto-enrolled into one shared "Welcome to Autodidact" course on their first authenticated request, and the mobile app deep-links them straight into it on first launch.

**Architecture:** A hand-written Drizzle migration adds `courses.is_onboarding` (with a partial unique index) + `users.onboarded_at`. An idempotent `seedOnboardingCourse()` upserts a placeholder course + modules; it runs in local post-migrate scripts and as a prod CI step after migrations. A NestJS global interceptor (`APP_INTERCEPTOR`) calls a fire-once `OnboardingService.onboardOnce()` that reuses the existing idempotent `CoursesService.enrollUser()` and stamps `onboarded_at`. The mobile app gains a persisted `hasSeenOnboarding` flag and an `AuthGate` (inside `app/_layout.tsx`) that `router.replace`s into the onboarding course's detail screen on first launch.

**Tech Stack:** Drizzle ORM + Postgres (`@autodidact/db`), NestJS (`services/api`), Expo Router + Zustand + TanStack Query (`apps/mobile`), Vitest (backend) / Jest-expo (mobile), Testcontainers via `@autodidact/test-support`, GitHub Actions (`deploy.yml`).

## Global Constraints

- **Drizzle is the sole migration authority.** Schema changes go through `packages/db/migrations/` as **hand-written SQL** — `db:generate:dev` is broken and the snapshot chain is incomplete (`packages/db/CLAUDE.md`). Update the schema file (`src/schema/*.ts`) **and** add the `.sql` migration **and** the `migrations/meta/_journal.json` entry in the same commit.
- **`getDb()` is called at query time, never at module top level** (`packages/db/CLAUDE.md`).
- **`courses.generated_by` is already nullable** — the placeholder's `generated_by=NULL` needs no migration change.
- **API:** all controllers keep `@UseGuards(AuthGuard)`; global prefix is `v1`; use `@autodidact/observability` `createLogger(name)` for logs (never `console.log`); use Drizzle via `@autodidact/db` (never raw `pg`). Register cross-cutting behavior via `APP_INTERCEPTOR` (matches the existing `APP_FILTER`), **never** `APP_GUARD` (`services/api/CLAUDE.md`).
- **`module_progress` rows are created in exactly one place — `CoursesService.enrollUser()`.** Reuse it; never insert progress rows elsewhere (`services/api/src/modules/courses/CLAUDE.md`).
- **Mobile:** Tamagui only; server state via TanStack Query only (never cache it in Zustand); auth/session state via `auth.store` + `expo-secure-store`; **the redirect guard is owned solely by `app/_layout.tsx`** — do not add competing redirect guards elsewhere (`apps/mobile/CLAUDE.md`). Mobile tests use **Jest-expo**, not Vitest.
- **Auto-enroll degrades gracefully:** a missing onboarding course logs + skips and never blocks a request (spec D5).

---

### Task 1: Schema — `is_onboarding` + `onboarded_at` (migration 0011)

**Files:**
- Modify: `packages/db/src/schema/courses.ts`
- Modify: `packages/db/src/schema/users.ts`
- Create: `packages/db/migrations/0011_onboarding.sql`
- Modify: `packages/db/migrations/meta/_journal.json`
- Test: `packages/test-support/src/__tests__/onboarding-schema.integration.test.ts`

**Interfaces:**
- Produces: `courses.isOnboarding` (boolean, not null, default false) + partial unique index `courses_is_onboarding_unique`; `users.onboardedAt` (nullable timestamp). Consumed by Tasks 2, 5, 6.

- [ ] **Step 1: Write the failing integration test**

Create `packages/test-support/src/__tests__/onboarding-schema.integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { withTestDatabase, type TestDatabase } from '../database.js';
import { courses, users, eq } from '@autodidact/db';

let h: TestDatabase;
beforeAll(async () => { h = await withTestDatabase(); }, 90_000);
afterAll(async () => { await h?.close(); });
beforeEach(async () => { await h.truncate(); });

describe('onboarding schema (migration 0011)', () => {
  it('allows exactly one is_onboarding course (partial unique index)', async () => {
    await h.db.insert(courses).values({
      topic: 'Welcome', slug: 'welcome-1', title: 'Welcome', description: 'd',
      status: 'ready', isOnboarding: true,
    });
    await expect(
      h.db.insert(courses).values({
        topic: 'Welcome', slug: 'welcome-2', title: 'Welcome 2', description: 'd',
        status: 'ready', isOnboarding: true,
      }),
    ).rejects.toThrow();
  });

  it('permits many non-onboarding courses (partial index ignores false)', async () => {
    await h.db.insert(courses).values({ topic: 'a', slug: 'a', title: 'a', description: 'd', status: 'ready' });
    await h.db.insert(courses).values({ topic: 'b', slug: 'b', title: 'b', description: 'd', status: 'ready' });
    const rows = await h.db.select({ id: courses.id }).from(courses);
    expect(rows.length).toBe(2);
  });

  it('users.onboarded_at defaults to null and is settable', async () => {
    const [u] = await h.db
      .insert(users)
      .values({ supabaseId: crypto.randomUUID() })
      .returning({ id: users.id, onboardedAt: users.onboardedAt });
    expect(u?.onboardedAt).toBeNull();
    await h.db.update(users).set({ onboardedAt: new Date() }).where(eq(users.id, u!.id));
    const [after] = await h.db
      .select({ onboardedAt: users.onboardedAt })
      .from(users)
      .where(eq(users.id, u!.id));
    expect(after?.onboardedAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @autodidact/db build && pnpm --filter @autodidact/test-support test onboarding-schema`
Expected: FAIL — `courses.isOnboarding` / `users.onboardedAt` do not exist (TS compile error or missing column).

- [ ] **Step 3: Add the columns + partial unique index to the schema**

Replace `packages/db/src/schema/courses.ts` with:

```typescript
import { pgTable, uuid, text, timestamp, boolean, integer, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { courseStatusEnum, difficultyEnum } from './enums.js';
import { users } from './users.js';
import { vector } from '../vector.js';
import type { CourseBlueprint } from '@autodidact/types';

export const courses = pgTable(
  'courses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topic: text('topic').notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    difficulty: difficultyEnum('difficulty').notNull().default('beginner'),
    estimatedHours: integer('estimated_hours'),
    status: courseStatusEnum('status').notNull().default('pending'),
    blueprint: jsonb('blueprint').$type<CourseBlueprint>(),
    topicEmbedding: vector('topic_embedding', { dimensions: 1536 }),
    isPublic: boolean('is_public').notNull().default(true),
    isOnboarding: boolean('is_onboarding').notNull().default(false),
    generatedBy: uuid('generated_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('courses_is_onboarding_unique').on(t.isOnboarding).where(sql`${t.isOnboarding}`),
  ],
);
```

Edit `packages/db/src/schema/users.ts` — add `onboardedAt` right before `createdAt`:

```typescript
import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  supabaseId: uuid('supabase_id').notNull().unique(),
  email: text('email').unique(),
  isAnonymous: boolean('is_anonymous').notNull().default(false),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  onboardedAt: timestamp('onboarded_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

- [ ] **Step 4: Create the hand-written migration**

Create `packages/db/migrations/0011_onboarding.sql`:

```sql
-- 0011_onboarding.sql
-- Spec 3 — onboarding course mechanism.
-- Hand-authored SQL (db:generate is broken; see packages/db/CLAUDE.md). The schema
-- files courses.ts / users.ts are updated in the same commit to remain the source of truth.

ALTER TABLE "courses" ADD COLUMN "is_onboarding" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "courses_is_onboarding_unique" ON "courses" ("is_onboarding") WHERE "is_onboarding";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarded_at" timestamp;
```

- [ ] **Step 5: Register the migration in the journal**

In `packages/db/migrations/meta/_journal.json`, append a new entry to the `entries` array (after the `0010_policy_hardening` object, idx 9):

```json
    {
      "idx": 10,
      "version": "7",
      "when": 1782400000000,
      "tag": "0011_onboarding",
      "breakpoints": true
    }
```

- [ ] **Step 6: Build and run the test to verify it passes**

Run: `pnpm --filter @autodidact/db build && pnpm --filter @autodidact/test-support test onboarding-schema`
Expected: PASS (all 3 cases).

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema/courses.ts packages/db/src/schema/users.ts \
        packages/db/migrations/0011_onboarding.sql packages/db/migrations/meta/_journal.json \
        packages/test-support/src/__tests__/onboarding-schema.integration.test.ts
git commit -m "feat(db): add courses.is_onboarding + users.onboarded_at (migration 0011)"
```

---

### Task 2: Idempotent seed — `seedOnboardingCourse()` + runner

**Files:**
- Create: `packages/db/src/seed/onboarding.ts`
- Modify: `packages/db/src/index.ts` (export `seedOnboardingCourse`)
- Modify: `packages/db/package.json` (add `tsx` devDep + `db:seed:onboarding` script)
- Modify: `package.json` (root — add `db:seed:onboarding:dev` passthrough)
- Test: `packages/test-support/src/__tests__/onboarding-seed.integration.test.ts`

**Interfaces:**
- Consumes: `courses.isOnboarding`, `modules` (Task 1).
- Produces: `seedOnboardingCourse(db?: DB): Promise<{ courseId: string }>` (exported from `@autodidact/db`). CLI: `pnpm --filter @autodidact/db db:seed:onboarding`. Consumed by Tasks 3, 4.

- [ ] **Step 1: Write the failing integration test**

Create `packages/test-support/src/__tests__/onboarding-seed.integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { withTestDatabase, type TestDatabase } from '../database.js';
import { seedOnboardingCourse, courses, modules, eq } from '@autodidact/db';

let h: TestDatabase;
beforeAll(async () => { h = await withTestDatabase(); }, 90_000);
afterAll(async () => { await h?.close(); });
beforeEach(async () => { await h.truncate(); });

describe('seedOnboardingCourse', () => {
  it('creates exactly one onboarding course with its modules', async () => {
    const { courseId } = await seedOnboardingCourse(h.db);
    const rows = await h.db
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.isOnboarding, true));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(courseId);
    const mods = await h.db.select({ id: modules.id }).from(modules).where(eq(modules.courseId, courseId));
    expect(mods.length).toBeGreaterThanOrEqual(1);
  });

  it('is idempotent — running twice yields one course and stable module ids', async () => {
    const first = await seedOnboardingCourse(h.db);
    const before = await h.db
      .select({ id: modules.id, position: modules.position })
      .from(modules)
      .where(eq(modules.courseId, first.courseId))
      .orderBy(modules.position);

    const second = await seedOnboardingCourse(h.db);
    expect(second.courseId).toBe(first.courseId);

    const courseRows = await h.db.select({ id: courses.id }).from(courses).where(eq(courses.isOnboarding, true));
    expect(courseRows).toHaveLength(1);

    const after = await h.db
      .select({ id: modules.id, position: modules.position })
      .from(modules)
      .where(eq(modules.courseId, first.courseId))
      .orderBy(modules.position);
    expect(after.map((m) => m.id)).toEqual(before.map((m) => m.id)); // ids preserved (module_progress FK has no cascade)
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @autodidact/test-support test onboarding-seed`
Expected: FAIL — `seedOnboardingCourse` is not exported from `@autodidact/db`.

- [ ] **Step 3: Write the seed script**

Create `packages/db/src/seed/onboarding.ts`:

```typescript
import { getDb, getPool, courses, modules, eq, type DB } from '../index.js';
import type { ContentSection } from '@autodidact/types';

const ONBOARDING_SLUG = 'welcome-to-autodidact';

interface PlaceholderModule {
  position: number;
  title: string;
  description: string;
  objectives: string[];
  contentOutline: ContentSection[];
  estimatedMinutes: number;
}

// Placeholder content only — the real curated content is a separate product task (spec D2).
const PLACEHOLDER_MODULES: PlaceholderModule[] = [
  {
    position: 0,
    title: 'Welcome to Autodidact',
    description: 'A quick tour of how learning works here.',
    objectives: ['Understand how Autodidact courses are structured'],
    contentOutline: [
      { title: 'How it works', points: ['Courses are made of modules', 'Each module is a guided chat lesson'] },
    ],
    estimatedMinutes: 5,
  },
  {
    position: 1,
    title: 'Generate your first course',
    description: 'Create a real AI-generated course on any topic you choose.',
    objectives: ['Generate your first course from a topic'],
    contentOutline: [
      { title: 'Try it', points: ['Pick a topic', 'Watch Autodidact build a course for you'] },
    ],
    estimatedMinutes: 5,
  },
];

/**
 * Upsert the single shared onboarding course + its modules. Idempotent and safe
 * to re-run (the partial unique index on `is_onboarding` guards duplicates).
 * Modules are upserted BY POSITION so their ids stay stable across runs —
 * module_progress.module_id has no ON DELETE cascade, so deleting modules would
 * orphan/block existing users' progress.
 */
export async function seedOnboardingCourse(db: DB = getDb()): Promise<{ courseId: string }> {
  const [existing] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.isOnboarding, true))
    .limit(1);

  let courseId: string;
  const courseFields = {
    topic: 'Welcome to Autodidact',
    slug: ONBOARDING_SLUG,
    title: 'Welcome to Autodidact',
    description: 'Your first course — learn how Autodidact works, then build your own.',
    difficulty: 'beginner' as const,
    status: 'ready' as const,
    isPublic: true,
  };

  if (existing) {
    courseId = existing.id;
    await db.update(courses).set({ ...courseFields, updatedAt: new Date() }).where(eq(courses.id, courseId));
  } else {
    const [inserted] = await db
      .insert(courses)
      .values({ ...courseFields, isOnboarding: true, generatedBy: null })
      .returning({ id: courses.id });
    if (!inserted) throw new Error('seedOnboardingCourse: course insert returned no row');
    courseId = inserted.id;
  }

  const existingModules = await db
    .select({ id: modules.id, position: modules.position })
    .from(modules)
    .where(eq(modules.courseId, courseId));
  const idByPosition = new Map(existingModules.map((m) => [m.position, m.id]));

  for (const m of PLACEHOLDER_MODULES) {
    const moduleId = idByPosition.get(m.position);
    if (moduleId) {
      await db
        .update(modules)
        .set({
          title: m.title,
          description: m.description,
          objectives: m.objectives,
          contentOutline: m.contentOutline,
          estimatedMinutes: m.estimatedMinutes,
        })
        .where(eq(modules.id, moduleId));
    } else {
      await db.insert(modules).values({
        courseId,
        position: m.position,
        title: m.title,
        description: m.description,
        objectives: m.objectives,
        contentOutline: m.contentOutline,
        estimatedMinutes: m.estimatedMinutes,
      });
    }
  }

  return { courseId };
}

// CLI entry: `tsx src/seed/onboarding.ts` (DATABASE_URL must be set in the env).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  seedOnboardingCourse()
    .then(({ courseId }) => {
      console.log(`✓ Onboarding course seeded: ${courseId}`);
      return getPool().end();
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('✗ Onboarding seed failed:', err);
      process.exit(1);
    });
}
```

- [ ] **Step 4: Export the seed from the package index**

Edit `packages/db/src/index.ts` — add after the schema export line:

```typescript
export { seedOnboardingCourse } from './seed/onboarding.js';
```

- [ ] **Step 5: Add the runner script + tsx dependency**

In `packages/db/package.json`, add to `scripts` (after `db:studio`):

```json
    "db:seed:onboarding": "tsx src/seed/onboarding.ts",
```

and add to `devDependencies` (keep alphabetical):

```json
    "tsx": "^4.19.0",
```

In the root `package.json`, add to `scripts` (after `db:generate:dev`):

```json
    "db:seed:onboarding:dev": "dotenv -e .env.dev -- pnpm --filter @autodidact/db db:seed:onboarding",
```

Then install: `pnpm install`

- [ ] **Step 6: Build and run the test to verify it passes**

Run: `pnpm --filter @autodidact/db build && pnpm --filter @autodidact/test-support test onboarding-seed`
Expected: PASS (both cases, including stable module ids on re-run).

- [ ] **Step 7: Verify the CLI runner end-to-end against the local stack**

Run (requires the local Supabase stack up + migrations applied):
```bash
pnpm db:seed:onboarding:dev
```
Expected: prints `✓ Onboarding course seeded: <uuid>` and exits 0. Re-run it — it must succeed again (idempotent).

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/seed/onboarding.ts packages/db/src/index.ts \
        packages/db/package.json package.json pnpm-lock.yaml \
        packages/test-support/src/__tests__/onboarding-seed.integration.test.ts
git commit -m "feat(db): idempotent seedOnboardingCourse() + db:seed:onboarding runner"
```

---

### Task 3: Wire the seed into local post-migrate scripts

**Files:**
- Modify: `scripts/setup.sh`
- Modify: `scripts/db-reset.sh`

**Interfaces:** Consumes `db:seed:onboarding` (Task 2). No code interface. (Do **not** add the seed to `scripts/migrate.sh` — that script is shared by `migrate:prod`, and prod seeding is a separate CI step in Task 4.)

- [ ] **Step 1: Add the seed step to `setup.sh`**

In `scripts/setup.sh`, immediately after the migrate block (after the line `ok "Migrations applied"`) and before the `# ── Build` block, insert:

```bash
# ── Seed onboarding course ─────────────────────────────────────────────────────
step "Seeding the onboarding course"
dotenv -e .env.dev -- pnpm --filter @autodidact/db db:seed:onboarding
ok "Onboarding course seeded"
```

- [ ] **Step 2: Add the seed step to `db-reset.sh`**

In `scripts/db-reset.sh`, immediately after the migrate block (after the line `ok "Migrations applied"`) and before the final completion echo, insert (DATABASE_URL is already exported by the `dotenv -e .env.dev` wrapper that invokes this script):

```bash
step "Seeding the onboarding course"
pnpm --filter @autodidact/db db:seed:onboarding
ok "Onboarding course seeded"
```

- [ ] **Step 3: Verify the reset path seeds the course**

Run: `pnpm db:reset:dev` (type `yes` at the prompt).
Expected: after migrations, prints `✓ Onboarding course seeded: <uuid>`. Confirm with:
```bash
pnpm db:studio:dev   # or query: SELECT id, title FROM courses WHERE is_onboarding;
```
Expected: exactly one row titled "Welcome to Autodidact".

- [ ] **Step 4: Commit**

```bash
git add scripts/setup.sh scripts/db-reset.sh
git commit -m "chore(scripts): seed onboarding course after local migrations"
```

---

### Task 4: Prod deploy seed step (spec D9)

**Files:**
- Modify: `.github/workflows/deploy.yml`

**Interfaces:** Consumes `db:seed:onboarding` (Task 2). The step runs **after** migrations and **before** Cloud Run deploy; a seed failure **fails the deploy** (no `|| true`).

- [ ] **Step 1: Insert the seed step after the migration step**

In `.github/workflows/deploy.yml`, the existing migration step is:

```yaml
      - name: Run database migrations
        env:
          DATABASE_URL: ${{ secrets.PROD_DATABASE_URL }}
        run: pnpm --filter @autodidact/db db:migrate
```

Immediately after it (and before the `- name: Deploy Cloud Run services` step), add:

```yaml
      - name: Seed onboarding course
        env:
          DATABASE_URL: ${{ secrets.PROD_DATABASE_URL }}
        run: pnpm --filter @autodidact/db db:seed:onboarding
```

- [ ] **Step 2: Verify the workflow YAML is well-formed**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))" && echo OK`
Expected: prints `OK`. Confirm by eye that the new step sits between "Run database migrations" and "Deploy Cloud Run services", and reuses `secrets.PROD_DATABASE_URL`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci(deploy): seed onboarding course after prod migrations (fail-the-deploy on error)"
```

---

### Task 5: API auto-enroll — `OnboardingService` + global interceptor

**Files:**
- Create: `services/api/src/modules/onboarding/onboarding.service.ts`
- Create: `services/api/src/modules/onboarding/onboarding.interceptor.ts`
- Create: `services/api/src/modules/onboarding/onboarding.module.ts`
- Modify: `services/api/src/app.module.ts` (import `OnboardingModule`, register `APP_INTERCEPTOR`)
- Modify: `services/api/src/modules/courses/courses.service.ts` (add `isOnboarding` to `getUserCourses` select)
- Test: `services/api/src/__tests__/onboarding.service.test.ts`

**Interfaces:**
- Consumes: `users.onboardedAt`, `courses.isOnboarding` (Task 1); `CoursesService.enrollUser(userId: string, courseId: string)` (existing); `createLogger(name)` from `@autodidact/observability`; `AuthUser` (`request.user.id`) attached by `AuthGuard`.
- Produces: `OnboardingService.onboardOnce(userId: string): Promise<void>` (fire-once, never throws to caller). `getUserCourses` now returns `isOnboarding: boolean` per row (consumed by Task 6).

- [ ] **Step 1: Write the failing unit test**

Create `services/api/src/__tests__/onboarding.service.test.ts` (mirrors the `provisioning.service.test.ts` mock pattern):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
vi.mock('@autodidact/db', () => ({
  getDb: () => ({ select: mockSelect, update: mockUpdate }),
  users: { id: 'id', onboardedAt: 'onboarded_at' },
  courses: { id: 'id', isOnboarding: 'is_onboarding' },
  eq: (col: unknown, val: unknown) => ({ col, val }),
  sql: (s: unknown) => s,
}));
vi.mock('@autodidact/observability', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { OnboardingService } from '../modules/onboarding/onboarding.service.js';

function selectReturning(rows: unknown[]) {
  return { from: () => ({ where: () => ({ limit: async () => rows }) }) };
}

describe('OnboardingService.onboardOnce', () => {
  let enrollUser: ReturnType<typeof vi.fn>;
  let service: OnboardingService;

  beforeEach(() => {
    mockSelect.mockReset();
    mockUpdate.mockReset();
    enrollUser = vi.fn().mockResolvedValue(undefined);
    mockUpdate.mockReturnValue({ set: () => ({ where: async () => undefined }) });
    service = new OnboardingService({ enrollUser } as never);
  });

  it('enrolls and stamps onboarded_at on the first request', async () => {
    mockSelect
      .mockReturnValueOnce(selectReturning([{ onboardedAt: null }]))  // user lookup
      .mockReturnValueOnce(selectReturning([{ id: 'course-1' }]));    // onboarding course
    await service.onboardOnce('user-1');
    expect(enrollUser).toHaveBeenCalledWith('user-1', 'course-1');
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when already onboarded (onboarded_at set)', async () => {
    mockSelect.mockReturnValueOnce(selectReturning([{ onboardedAt: new Date() }]));
    await service.onboardOnce('user-1');
    expect(enrollUser).not.toHaveBeenCalled();
  });

  it('skips gracefully (no throw, no enroll) when no onboarding course exists', async () => {
    mockSelect
      .mockReturnValueOnce(selectReturning([{ onboardedAt: null }]))
      .mockReturnValueOnce(selectReturning([])); // no onboarding course
    await expect(service.onboardOnce('user-1')).resolves.toBeUndefined();
    expect(enrollUser).not.toHaveBeenCalled();
  });

  it('caches after success — the second call does not hit the DB', async () => {
    mockSelect
      .mockReturnValueOnce(selectReturning([{ onboardedAt: null }]))
      .mockReturnValueOnce(selectReturning([{ id: 'course-1' }]));
    await service.onboardOnce('user-1');
    mockSelect.mockClear();
    await service.onboardOnce('user-1');
    expect(mockSelect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @autodidact/api test onboarding.service`
Expected: FAIL — `OnboardingService` does not exist.

- [ ] **Step 3: Write `OnboardingService`**

Create `services/api/src/modules/onboarding/onboarding.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { getDb, users, courses, eq, sql } from '@autodidact/db';
import { createLogger } from '@autodidact/observability';
import { CoursesService } from '../courses/courses.service.js';

@Injectable()
export class OnboardingService {
  private readonly logger = createLogger('onboarding');
  private readonly onboarded = new Set<string>();

  constructor(private readonly coursesService: CoursesService) {}

  /**
   * Fire-once auto-enroll. On a user's first authenticated request, enroll them
   * into the shared onboarding course and stamp users.onboarded_at. Cheap on
   * every later request (in-process Set + onboarded_at short-circuit). A missing
   * onboarding course logs + skips (spec D5) and never throws to the caller.
   */
  async onboardOnce(userId: string): Promise<void> {
    if (this.onboarded.has(userId)) return;

    const db = getDb();
    const [user] = await db
      .select({ onboardedAt: users.onboardedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) return; // not provisioned yet — surfaced elsewhere; don't cache.
    if (user.onboardedAt) {
      this.onboarded.add(userId);
      return;
    }

    const [course] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.isOnboarding, true))
      .limit(1);

    if (!course) {
      this.logger.warn({ userId }, 'No onboarding course found — skipping auto-enroll');
      return; // do not cache: self-heals once the course is seeded.
    }

    await this.coursesService.enrollUser(userId, course.id);
    await db.update(users).set({ onboardedAt: sql`now()` }).where(eq(users.id, userId));
    this.onboarded.add(userId);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @autodidact/api test onboarding.service`
Expected: PASS (all 4 cases).

- [ ] **Step 5: Write the interceptor**

Create `services/api/src/modules/onboarding/onboarding.interceptor.ts`:

```typescript
import { Injectable, type NestInterceptor, type ExecutionContext, type CallHandler } from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { Request } from 'express';
import type { AuthUser } from '@autodidact/types';
import { createLogger } from '@autodidact/observability';
import { OnboardingService } from './onboarding.service.js';

@Injectable()
export class OnboardingInterceptor implements NestInterceptor {
  private readonly logger = createLogger('onboarding');

  constructor(private readonly onboarding: OnboardingService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const userId = request.user?.id;
    if (userId) {
      try {
        // Awaited so the onboarding course is present in the SAME first GET /courses response.
        await this.onboarding.onboardOnce(userId);
      } catch (err) {
        // Never block the request on onboarding (spec D5).
        this.logger.error({ err, userId }, 'Auto-enroll onboarding hook failed; continuing request');
      }
    }
    return next.handle();
  }
}
```

- [ ] **Step 6: Write the module**

Create `services/api/src/modules/onboarding/onboarding.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { CoursesModule } from '../courses/courses.module.js';
import { OnboardingService } from './onboarding.service.js';

@Module({
  imports: [CoursesModule],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
```

- [ ] **Step 7: Register the interceptor globally in `AppModule`**

Replace `services/api/src/app.module.ts` with:

```typescript
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from './modules/auth/auth.module.js';
import { QueueModule } from './modules/queue/queue.module.js';
import { ProvisioningModule } from './modules/provisioning/provisioning.module.js';
import { CoursesModule } from './modules/courses/courses.module.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { ProgressModule } from './modules/progress/progress.module.js';
import { AgentModule } from './modules/agent/agent.module.js';
import { OnboardingModule } from './modules/onboarding/onboarding.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';
import { OnboardingInterceptor } from './modules/onboarding/onboarding.interceptor.js';

@Module({
  imports: [AuthModule, QueueModule, ProvisioningModule, CoursesModule, ChatModule, ProgressModule, AgentModule, OnboardingModule],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: OnboardingInterceptor,
    },
  ],
})
export class AppModule {}
```

- [ ] **Step 8: Expose `isOnboarding` on `GET /courses`**

In `services/api/src/modules/courses/courses.service.ts`, in the `getUserCourses` select object, add `isOnboarding: courses.isOnboarding,` after the `status` line:

```typescript
      .select({
        id: courses.id,
        title: courses.title,
        description: courses.description,
        difficulty: courses.difficulty,
        status: courses.status,
        isOnboarding: courses.isOnboarding,
        enrolledAt: enrollments.enrolledAt,
        completedAt: enrollments.completedAt,
      })
```

- [ ] **Step 9: Build sibling packages, then run the full API suite (incl. e2e)**

Run: `pnpm --filter @autodidact/db build && pnpm --filter @autodidact/api test`
Expected: PASS. Note: the global interceptor now runs on every authenticated request in the e2e suite; with no onboarding course seeded in the e2e Testcontainers DB, `onboardOnce` logs + skips (no enroll), so the existing e2e stays green.

- [ ] **Step 10: Commit**

```bash
git add services/api/src/modules/onboarding/ services/api/src/app.module.ts \
        services/api/src/modules/courses/courses.service.ts \
        services/api/src/__tests__/onboarding.service.test.ts
git commit -m "feat(api): auto-enroll new users into the onboarding course (fire-once interceptor)"
```

---

### Task 6: Mobile — first-launch deep-link (spec D10)

**Files:**
- Modify: `apps/mobile/src/stores/auth.store.ts` (add persisted `hasSeenOnboarding`)
- Modify: `apps/mobile/src/api/courses.ts` (typed `Course` incl. `isOnboarding`; gate the query on auth)
- Modify: `apps/mobile/app/(app)/courses/index.tsx` (use the shared `Course` type)
- Modify: `apps/mobile/app/_layout.tsx` (extract `AuthGate` inside the provider; add the deep-link)
- Test: `apps/mobile/src/stores/__tests__/auth.store.test.ts` (Jest)

**Interfaces:**
- Consumes: `GET /courses` now returns `isOnboarding` (Task 5); `router.replace` to `/(app)/courses/${id}` (existing pattern in `useCourseGeneration.ts`).
- Produces: `useAuthStore` gains `hasSeenOnboarding: boolean` + `setHasSeenOnboarding(seen: boolean)`; `Course` type exported from `@/api/courses`.

- [ ] **Step 1: Write the failing store test**

Create `apps/mobile/src/stores/__tests__/auth.store.test.ts`:

```typescript
import { useAuthStore } from '../auth.store';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

describe('auth.store — hasSeenOnboarding', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'tok', refreshToken: 'ref', user: null, isAnonymous: false, hasSeenOnboarding: false,
    });
  });

  it('defaults to false', () => {
    expect(useAuthStore.getState().hasSeenOnboarding).toBe(false);
  });

  it('setHasSeenOnboarding flips the flag', () => {
    useAuthStore.getState().setHasSeenOnboarding(true);
    expect(useAuthStore.getState().hasSeenOnboarding).toBe(true);
  });

  it('clearSession does NOT reset hasSeenOnboarding (device-local UX, not session state)', () => {
    useAuthStore.getState().setHasSeenOnboarding(true);
    useAuthStore.getState().clearSession();
    expect(useAuthStore.getState().hasSeenOnboarding).toBe(true);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @autodidact/mobile test auth.store`
Expected: FAIL — `hasSeenOnboarding` / `setHasSeenOnboarding` do not exist.

- [ ] **Step 3: Add `hasSeenOnboarding` to the auth store**

Replace `apps/mobile/src/stores/auth.store.ts` with:

```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import type { UserProfile } from '@autodidact/types';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserProfile | null;
  isAnonymous: boolean;
  hasSeenOnboarding: boolean;
  setSession: (accessToken: string, refreshToken: string, isAnonymous?: boolean) => void;
  setUser: (user: UserProfile) => void;
  setHasSeenOnboarding: (seen: boolean) => void;
  clearSession: () => void;
}

const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAnonymous: false,
      hasSeenOnboarding: false,
      setSession: (accessToken, refreshToken, isAnonymous = false) =>
        set({ accessToken, refreshToken, isAnonymous }),
      setUser: (user) => set({ user }),
      setHasSeenOnboarding: (seen) => set({ hasSeenOnboarding: seen }),
      // hasSeenOnboarding intentionally survives sign-out — it is device-local UX, not session state.
      clearSession: () => set({ accessToken: null, refreshToken: null, user: null, isAnonymous: false }),
    }),
    {
      name: 'autodidact-auth',
      storage: createJSONStorage(() => secureStorage),
    },
  ),
);
```

- [ ] **Step 4: Run the store test to verify it passes**

Run: `pnpm --filter @autodidact/mobile test auth.store`
Expected: PASS (all 3 cases).

- [ ] **Step 5: Type the courses query + gate it on auth**

In `apps/mobile/src/api/courses.ts`, add the import and replace `useUserCourses` (leave the other hooks unchanged):

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import { useAuthStore } from '../stores/auth.store';

export type Course = {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  status: string;
  isOnboarding: boolean;
  enrolledAt: string;
  completedAt: string | null;
};

export function useUserCourses() {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['courses'],
    queryFn: async (): Promise<Course[]> => {
      const res = await apiFetch('/courses');
      if (!res.ok) throw new Error('Failed to fetch courses');
      return res.json() as Promise<Course[]>;
    },
    enabled: !!accessToken, // never fetch /courses on the auth screens (avoids a 401 that clears the session)
  });
}
```

- [ ] **Step 6: Use the shared `Course` type in the list screen**

In `apps/mobile/app/(app)/courses/index.tsx`, delete the local `type Course = {...}` block and import the shared type instead — change the `useUserCourses` import line to:

```typescript
import { useUserCourses, type Course } from '@/api/courses';
```

(The screen already references only `id`, `title`, `description`, `difficulty`, `completedAt`, all present on the shared type — no other change needed.)

- [ ] **Step 7: Add the first-launch deep-link in `app/_layout.tsx`**

Replace `apps/mobile/app/_layout.tsx` with (session-restore effects stay in `RootLayout`; the redirect logic moves into an inner `AuthGate` rendered **inside** `QueryClientProvider` so it can read the courses query — the redirect owner stays this file, satisfying the `apps/mobile/CLAUDE.md` invariant).

> **Preserve the existing DEV_AUTO_LOGIN slot exactly as it is today — do not drop it.** The current `_layout.tsx` carries the D8 precedence comment block and a `// Spec 4 DEV_AUTO_LOGIN slot goes here` comment inside the auth-precedence effect; both are the seam for the unattended dev auto-login workflow. Only their *location* changes (they move into `AuthGate` as effect #1, verbatim) — their content must be kept byte-for-byte. The code below shows them in place:

```typescript
import { useEffect, type ReactNode } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TamaguiProvider } from 'tamagui';
import { useAuthStore } from '@/stores/auth.store';
import { useUserCourses } from '@/api/courses';
import { supabase } from '@/lib/supabase';
import config from '@/design/config';
import { ErrorBoundary, ToastProvider } from '@/components';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function RootLayout() {
  const { accessToken, refreshToken, setSession, clearSession } = useAuthStore();

  // On app launch, restore the Supabase in-memory session from our persisted tokens.
  useEffect(() => {
    if (accessToken && refreshToken) {
      void supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    }
  }, []);

  // Keep our store in sync with Supabase's session events (token refresh, sign-out).
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token && session?.refresh_token) {
        setSession(session.access_token, session.refresh_token, session.user?.is_anonymous ?? false);
      } else {
        clearSession();
      }
    });
    return () => subscription.unsubscribe();
  }, [setSession, clearSession]);

  return (
    <TamaguiProvider config={config} defaultTheme="dark">
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <AuthGate>
            <Slot />
          </AuthGate>
        </ErrorBoundary>
        <ToastProvider />
      </QueryClientProvider>
    </TamaguiProvider>
  );
}

// AuthGate owns the canonical auth-flow precedence (Spec 2, D8) AND the Spec 3 (D10)
// first-launch onboarding deep-link. It lives inside QueryClientProvider so it can read
// the courses query; keeping it in this file preserves the single-redirect-owner invariant
// (apps/mobile/CLAUDE.md).
function AuthGate({ children }: { children: ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasSeenOnboarding = useAuthStore((s) => s.hasSeenOnboarding);
  const setHasSeenOnboarding = useAuthStore((s) => s.setHasSeenOnboarding);
  const router = useRouter();
  const segments = useSegments();
  const { data: courses } = useUserCourses();

  // 1. Canonical auth-flow precedence (Spec 2, D8 — this file is the single owner):
  //   a. Persisted session restored in RootLayout → autoRefresh keeps it alive.
  //   b. Session present (real OR anonymous) → route into (app).
  //   c. No session + __DEV__ + extra.devAutoLogin → DEV_AUTO_LOGIN slot (Spec 4).
  //      Spec 4 implements this slot; it takes precedence over the guest path in
  //      dev so the two never both fire. Intentionally NOT implemented yet.
  //   d. Otherwise → auth UI ((auth) group), which offers real sign-in/up AND
  //      "Continue as guest" (signInAnonymously).
  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)';
    if (!accessToken && !inAuthGroup) {
      // Spec 4 DEV_AUTO_LOGIN slot goes here (before the redirect to auth UI). Preserve verbatim.
      router.replace('/(auth)/sign-in');
    } else if (accessToken && inAuthGroup) {
      router.replace('/(app)');
    }
  }, [accessToken, segments, router]);

  // 2. First-launch deep-link (D10): once authenticated and inside (app), if onboarding has
  // never been shown, jump straight into the onboarding course's detail screen.
  useEffect(() => {
    if (!accessToken || hasSeenOnboarding) return;
    if (segments[0] === '(auth)') return;
    if (!courses) return; // wait for GET /courses (auto-enroll runs server-side on that request)
    const onboarding = courses.find((c) => c.isOnboarding);
    if (!onboarding) return; // no onboarding course found (e.g. seed missing) — retry on the next launch
    setHasSeenOnboarding(true);
    router.replace(`/(app)/courses/${onboarding.id}`);
  }, [accessToken, hasSeenOnboarding, courses, segments, router, setHasSeenOnboarding]);

  return <>{children}</>;
}
```

- [ ] **Step 8: Typecheck and run the mobile test suite**

Run: `pnpm --filter @autodidact/mobile typecheck && pnpm --filter @autodidact/mobile test`
Expected: PASS (typecheck clean; `auth.store` tests green).

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/stores/auth.store.ts apps/mobile/src/api/courses.ts \
        apps/mobile/app/\(app\)/courses/index.tsx apps/mobile/app/_layout.tsx \
        apps/mobile/src/stores/__tests__/auth.store.test.ts
git commit -m "feat(mobile): deep-link into the onboarding course on first launch"
```

---

## End-to-end verification

After all tasks, verify the whole flow against the local stack:

1. **Reset + seed:** `pnpm db:reset:dev` → confirms migration 0011 applies and the onboarding course is seeded. Query: `SELECT id, title, is_onboarding FROM courses WHERE is_onboarding;` → exactly one "Welcome to Autodidact".
2. **Backend up:** `pnpm dev` (separate terminal).
3. **Auto-enroll:** create a brand-new account (or "Continue as guest") via the mobile app, then watch the API logs — the first authenticated request enrolls the user. Confirm in the DB:
   - `SELECT onboarded_at FROM users WHERE ...` → non-null after the first request.
   - `SELECT * FROM enrollments WHERE user_id = ...` → one row for the onboarding course.
   - `SELECT status FROM module_progress WHERE user_id = ... ORDER BY ...` → position-0 module `available`, rest `locked`.
   - Second request: `onboarded_at` unchanged, no duplicate enrollment.
4. **Missing-course path:** temporarily flip the flag (`UPDATE courses SET is_onboarding = false WHERE ...`), hit the API with a fresh user → request still succeeds (200), logs `No onboarding course found — skipping auto-enroll`, no enrollment created. Restore it.
5. **Mobile first-launch deep-link:** run the app (`pnpm mobile`, or the `run-mobile` skill for the WSL2 emulator). A fresh authenticated session lands directly on the onboarding course **detail** screen (not the course list / create screen). Kill + relaunch → lands on the normal `(app)` home, not the course (because `hasSeenOnboarding` is now persisted true).
6. **Anonymous → upgrade:** sign in as guest (auto-enrolled), upgrade to a real account via the profile screen → the enrollment + progress persist (UUID preserved; no extra code — reuses provisioning + `enrollUser`).

### Automated test commands (run before opening a PR)

```bash
pnpm --filter @autodidact/db build            # schema/seed dist must be fresh for downstream tests
pnpm --filter @autodidact/test-support test    # onboarding-schema + onboarding-seed integration
pnpm --filter @autodidact/api test             # onboarding.service unit + existing e2e
pnpm --filter @autodidact/mobile typecheck && pnpm --filter @autodidact/mobile test
pnpm lint
```

## Docs to update on completion

- Move this plan `to-be-reviewed/` → `in-progress/` when picked up, → `_done/` when shipped (add `> Completed: YYYY-MM-DD`), and update `docs/superpowers/plans/README.md` (`git mv` + index row). When the feature fully ships, move the spec to `specs/_done/`.
- No CLAUDE.md/README changes are required by this mechanism, but note for the **later content task**: replacing the placeholder with curated content (and any `module_content_chunks` embedding) is tracked in the spec's open items, not here.
