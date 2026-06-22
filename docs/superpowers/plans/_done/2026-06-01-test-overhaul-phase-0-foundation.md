# Test Overhaul — Phase 0: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared `@autodidact/test-support` package (real-DB + real-Redis Testcontainers harness, seed factories, full-migration runner), plumb soft coverage thresholds into the Vitest base config, and record the two deferred ADRs — so every later phase builds on one reusable, tested foundation.

**Architecture:** Extract the Testcontainers setup currently inlined in `services/api/src/__tests__/progress.service.integration.test.ts` into a standalone workspace package. The harness applies `docker/dev-db-init.sql` (extensions + Supabase `auth.*` stubs) then **all** migrations (`0001`→`0004`), so indexes and RLS are exercised — unlike the original which ran only `0001`. Seed factories take an explicit `db` argument (no reliance on the `vi.mock('@autodidact/db')` redirect, which stays as thin per-file boilerplate in consuming service tests). A parallel Redis harness boots `redis` for BullMQ integration in later phases.

**Tech Stack:** TypeScript, Vitest 2.1.0, Testcontainers (`@testcontainers/postgresql`, `@testcontainers/redis`), Drizzle ORM (`drizzle-orm/node-postgres`), `pg`, pnpm workspaces, Turborepo.

---

## Scope & file structure

This phase is self-contained and ships green: a new package plus a refactor of the one existing real-DB test to consume it, coverage plumbing, and two ADRs.

**Created:**
- `packages/test-support/package.json` — workspace package manifest
- `packages/test-support/tsconfig.json` — typecheck config (mirrors `packages/db`)
- `packages/test-support/tsconfig.build.json` — build config
- `packages/test-support/vitest.config.ts` — test config via `createBaseConfig`
- `packages/test-support/src/index.ts` — public barrel export
- `packages/test-support/src/database.ts` — `withTestDatabase()` + types
- `packages/test-support/src/seed.ts` — typed seed factories
- `packages/test-support/src/redis.ts` — `withTestRedis()` + types
- `packages/test-support/src/__tests__/database.test.ts` — harness self-test
- `packages/test-support/src/__tests__/seed.test.ts` — seed-factory self-test
- `packages/test-support/src/__tests__/redis.test.ts` — redis-harness self-test
- `packages/test-support/README.md` — usage narrative
- `packages/test-support/CLAUDE.md` — subtree invariants
- `docs/architecture/ADRs/cross-cutting/ADR-021-mobile-testing-second-runner.md` (via write-adr)
- `docs/architecture/ADRs/cross-cutting/ADR-022-e2e-testing-strategy.md` (via write-adr)

**Modified:**
- `vitest.workspace.ts` — register the new package
- `packages/config/vitest.base.ts` — deep-merge `coverage` overrides so packages can set `thresholds`
- `packages/config/src/__tests__/vitest-base.test.ts` — new test for the merge (create if absent)
- `services/api/package.json` — add `@autodidact/test-support` devDependency
- `services/api/src/__tests__/progress.service.integration.test.ts` — consume the harness

**Each file's responsibility:** `database.ts` owns container lifecycle + migration application; `seed.ts` owns row insertion only (pure, takes `db`); `redis.ts` owns the Redis container; `index.ts` re-exports. Split by responsibility so later phases import only what they need.

---

### Task 1: Scaffold the `@autodidact/test-support` package

**Files:**
- Create: `packages/test-support/package.json`
- Create: `packages/test-support/tsconfig.json`
- Create: `packages/test-support/tsconfig.build.json`
- Create: `packages/test-support/vitest.config.ts`
- Create: `packages/test-support/src/index.ts`
- Modify: `vitest.workspace.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@autodidact/test-support",
  "version": "0.1.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc --project tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@autodidact/db": "workspace:*",
    "@testcontainers/postgresql": "^10.13.0",
    "@testcontainers/redis": "^10.13.0",
    "drizzle-orm": "^0.38.0",
    "pg": "^8.13.0",
    "testcontainers": "^10.13.0"
  },
  "devDependencies": {
    "@autodidact/config": "workspace:*",
    "@types/node": "^22.0.0",
    "@types/pg": "^8.11.0",
    "@vitest/coverage-v8": "^2.1.0",
    "typescript": "^5.6.3",
    "vitest": "^2.1.0"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "@autodidact/config/tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist"
  },
  "exclude": ["src/__tests__/**", "**/*.test.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { createBaseConfig } from '../config/vitest.base.ts';

export default createBaseConfig({
  test: {
    name: 'test-support',
    include: ['src/__tests__/**/*.test.ts'],
    // Container boot dominates wall-clock; give suites room.
    testTimeout: 90_000,
    hookTimeout: 90_000,
  },
});
```

- [ ] **Step 5: Create a placeholder barrel `src/index.ts`** (filled by later tasks)

```ts
export {};
```

- [ ] **Step 6: Register the package in `vitest.workspace.ts`**

Add the line `'packages/test-support/vitest.config.ts',` to the array (after `'packages/observability/vitest.config.ts',`). Full file:

```ts
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/schemas/vitest.config.ts',
  'packages/db/vitest.config.ts',
  'packages/providers/vitest.config.ts',
  'packages/prompts/vitest.config.ts',
  'packages/observability/vitest.config.ts',
  'packages/test-support/vitest.config.ts',
  'services/agent/vitest.config.ts',
  'services/worker/vitest.config.ts',
  'services/api/vitest.config.ts',
]);
```

- [ ] **Step 7: Install dependencies**

Run: `pnpm install`
Expected: pnpm links the new workspace package; no errors. `@testcontainers/redis` resolves (new to the repo).

- [ ] **Step 8: Verify the package type-checks**

Run: `pnpm --filter @autodidact/test-support typecheck`
Expected: PASS (empty barrel compiles).

- [ ] **Step 9: Commit**

```bash
git add packages/test-support vitest.workspace.ts pnpm-lock.yaml
git commit -m "chore(test-support): scaffold shared test-support package"
```

---

### Task 2: `withTestDatabase()` — real-DB harness running all migrations

**Files:**
- Create: `packages/test-support/src/database.ts`
- Create: `packages/test-support/src/__tests__/database.test.ts`
- Modify: `packages/test-support/src/index.ts`

- [ ] **Step 1: Write the failing self-test** — `src/__tests__/database.test.ts`

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { withTestDatabase, type TestDatabase } from '../database.ts';

let h: TestDatabase;

beforeAll(async () => {
  h = await withTestDatabase();
}, 90_000);

afterAll(async () => {
  await h?.close();
});

describe('withTestDatabase', () => {
  it('applies all migrations: every domain table exists', async () => {
    const { rows } = await h.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const names = rows.map((r) => r.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        'users',
        'courses',
        'modules',
        'enrollments',
        'module_progress',
        'chat_sessions',
      ]),
    );
  });

  it('applies the RLS migration: row level security is enabled on users', async () => {
    const { rows } = await h.pool.query<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class WHERE relname = 'users'`,
    );
    expect(rows[0]?.relrowsecurity).toBe(true);
  });

  it('exposes a usable drizzle client', async () => {
    const result = await h.db.execute(sql`SELECT 1 AS one`);
    expect(result.rows[0]).toEqual({ one: 1 });
  });

  it('truncate() empties tables and restarts identity', async () => {
    await h.pool.query(
      `INSERT INTO users (supabase_id, email) VALUES (gen_random_uuid(), 'a@test.com')`,
    );
    await h.truncate();
    const { rows } = await h.pool.query<{ count: string }>(`SELECT count(*)::text FROM users`);
    expect(rows[0]?.count).toBe('0');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @autodidact/test-support test -- database`
Expected: FAIL — `Cannot find module '../database.ts'` (file not created yet).

- [ ] **Step 3: Implement `src/database.ts`**

```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// dev-db-init.sql creates the vector/uuid extensions and the Supabase auth.* stubs
// that the RLS migrations (0003/0004) reference. Without it, those migrations fail
// to compile — which is why the original inline harness ran only 0001.
const DEV_DB_INIT = join(__dirname, '../../../docker/dev-db-init.sql');
const MIGRATIONS_DIR = join(__dirname, '../../db/migrations');

// Tables truncated by truncate(); ordered child-before-parent for CASCADE safety.
// Keep in sync with packages/db/src/schema as new tables are added.
const TRUNCATE_TABLES = [
  'module_progress',
  'chat_sessions',
  'enrollments',
  'modules',
  'courses',
  'users',
];

export interface TestDatabase {
  /** Drizzle client bound to the test container. */
  db: NodePgDatabase;
  /** Raw pg pool, for setup/assertions that bypass Drizzle. */
  pool: Pool;
  /** The running Postgres container. */
  container: StartedPostgreSqlContainer;
  /** TRUNCATE all domain tables and restart identities. Call in beforeEach. */
  truncate: () => Promise<void>;
  /** Stop the pool and container. Call in afterAll. */
  close: () => Promise<void>;
}

/**
 * Boot a pgvector Postgres container, apply the dev auth stubs + every migration,
 * and return a Drizzle client plus lifecycle helpers. Connects as superuser, so
 * RLS policies are created and exercised but do not block seeding (matching dev).
 */
export async function withTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
    .withDatabase('autodidact_test')
    .withUsername('postgres')
    .withPassword('postgres')
    .start();

  const pool = new Pool({ connectionString: container.getConnectionUri() });
  const db = drizzle(pool);

  // 1. extensions + auth.* stubs
  await pool.query(readFileSync(DEV_DB_INIT, 'utf-8'));

  // 2. all .sql migrations in lexical order (0001 → 0004)
  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of migrationFiles) {
    await pool.query(readFileSync(join(MIGRATIONS_DIR, file), 'utf-8'));
  }

  const truncate = async () => {
    await pool.query(`TRUNCATE ${TRUNCATE_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
  };

  const close = async () => {
    await pool.end();
    await container.stop();
  };

  return { db, pool, container, truncate, close };
}
```

- [ ] **Step 4: Export from the barrel** — replace `src/index.ts` contents

```ts
export { withTestDatabase, type TestDatabase } from './database.ts';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @autodidact/test-support test -- database`
Expected: PASS (all 4 cases). First run pulls the `pgvector/pgvector:pg16` image — may take a minute.

- [ ] **Step 6: Commit**

```bash
git add packages/test-support/src/database.ts packages/test-support/src/__tests__/database.test.ts packages/test-support/src/index.ts
git commit -m "feat(test-support): add withTestDatabase harness running all migrations"
```

---

### Task 3: Typed seed factories

**Files:**
- Create: `packages/test-support/src/seed.ts`
- Create: `packages/test-support/src/__tests__/seed.test.ts`
- Modify: `packages/test-support/src/index.ts`

- [ ] **Step 1: Write the failing self-test** — `src/__tests__/seed.test.ts`

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { withTestDatabase, type TestDatabase } from '../database.ts';
import { seedUser, seedCourse, seedModules, seedEnrollment, seedModuleProgress } from '../seed.ts';

let h: TestDatabase;

beforeAll(async () => {
  h = await withTestDatabase();
}, 90_000);

afterAll(async () => {
  await h?.close();
});

beforeEach(async () => {
  await h.truncate();
});

describe('seed factories', () => {
  it('seedUser inserts and returns an id', async () => {
    const user = await seedUser(h.db);
    expect(user.id).toMatch(/[0-9a-f-]{36}/);
  });

  it('seedCourse links to the generating user', async () => {
    const user = await seedUser(h.db);
    const course = await seedCourse(h.db, user.id);
    expect(course.id).toBeTruthy();
  });

  it('seedModules creates N modules with ascending positions', async () => {
    const user = await seedUser(h.db);
    const course = await seedCourse(h.db, user.id);
    const mods = await seedModules(h.db, course.id, 3);
    expect(mods.map((m) => m.position)).toEqual([0, 1, 2]);
  });

  it('seedModuleProgress unlocks only position 0', async () => {
    const user = await seedUser(h.db);
    const course = await seedCourse(h.db, user.id);
    const mods = await seedModules(h.db, course.id, 2);
    await seedEnrollment(h.db, user.id, course.id);
    const progress = await seedModuleProgress(h.db, user.id, course.id, mods);
    const byPos = Object.fromEntries(
      progress.map((p, i) => [mods[i]!.position, p.status]),
    );
    expect(byPos[0]).toBe('available');
    expect(byPos[1]).toBe('locked');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @autodidact/test-support test -- seed`
Expected: FAIL — `Cannot find module '../seed.ts'`.

- [ ] **Step 3: Implement `src/seed.ts`** (extracted from the inline helpers in `progress.service.integration.test.ts`, now taking `db` explicitly)

```ts
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { users, courses, modules, enrollments, moduleProgress } from '@autodidact/db';

export interface SeededUser {
  id: string;
}
export interface SeededCourse {
  id: string;
}
export interface SeededModule {
  id: string;
  position: number;
}
export interface SeededEnrollment {
  id: string;
}

export async function seedUser(db: NodePgDatabase): Promise<SeededUser> {
  const [user] = await db
    .insert(users)
    .values({ supabaseId: crypto.randomUUID(), email: `user-${crypto.randomUUID()}@test.com` })
    .returning({ id: users.id });
  if (!user) throw new Error('seedUser: insert returned no row');
  return user;
}

export async function seedCourse(db: NodePgDatabase, generatedBy: string): Promise<SeededCourse> {
  const [course] = await db
    .insert(courses)
    .values({
      topic: 'Python',
      slug: `python-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Python Basics',
      description: 'Learn Python',
      difficulty: 'beginner',
      status: 'ready',
      generatedBy,
    })
    .returning({ id: courses.id });
  if (!course) throw new Error('seedCourse: insert returned no row');
  return course;
}

export async function seedModules(
  db: NodePgDatabase,
  courseId: string,
  count: number,
): Promise<SeededModule[]> {
  const rows = Array.from({ length: count }, (_, i) => ({
    courseId,
    position: i,
    title: `Module ${i}`,
    description: `Description ${i}`,
    objectives: ['obj1'],
    contentOutline: [{ title: 'Section', points: ['point'] }],
    estimatedMinutes: 30,
  }));
  return db.insert(modules).values(rows).returning({ id: modules.id, position: modules.position });
}

export async function seedEnrollment(
  db: NodePgDatabase,
  userId: string,
  courseId: string,
): Promise<SeededEnrollment> {
  const [enrollment] = await db
    .insert(enrollments)
    .values({ userId, courseId })
    .returning({ id: enrollments.id });
  if (!enrollment) throw new Error('seedEnrollment: insert returned no row');
  return enrollment;
}

export async function seedModuleProgress(
  db: NodePgDatabase,
  userId: string,
  courseId: string,
  mods: SeededModule[],
) {
  const rows = mods.map((m) => ({
    userId,
    moduleId: m.id,
    courseId,
    status: (m.position === 0 ? 'available' : 'locked') as 'available' | 'locked',
  }));
  return db.insert(moduleProgress).values(rows).returning();
}
```

- [ ] **Step 4: Extend the barrel** — `src/index.ts`

```ts
export { withTestDatabase, type TestDatabase } from './database.ts';
export {
  seedUser,
  seedCourse,
  seedModules,
  seedEnrollment,
  seedModuleProgress,
  type SeededUser,
  type SeededCourse,
  type SeededModule,
  type SeededEnrollment,
} from './seed.ts';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @autodidact/test-support test -- seed`
Expected: PASS (all 4 cases).

- [ ] **Step 6: Commit**

```bash
git add packages/test-support/src/seed.ts packages/test-support/src/__tests__/seed.test.ts packages/test-support/src/index.ts
git commit -m "feat(test-support): add typed seed factories"
```

---

### Task 4: `withTestRedis()` — real-Redis harness

**Files:**
- Create: `packages/test-support/src/redis.ts`
- Create: `packages/test-support/src/__tests__/redis.test.ts`
- Modify: `packages/test-support/src/index.ts`

- [ ] **Step 1: Write the failing self-test** — `src/__tests__/redis.test.ts`

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Queue } from 'bullmq';
import { withTestRedis, type TestRedis } from '../redis.ts';

let r: TestRedis;

beforeAll(async () => {
  r = await withTestRedis();
}, 60_000);

afterAll(async () => {
  await r?.close();
});

describe('withTestRedis', () => {
  it('exposes a connection url BullMQ can use', async () => {
    expect(r.url).toMatch(/^redis:\/\//);
    // BullMQ requires maxRetriesPerRequest: null on the connection.
    const queue = new Queue('test-support-probe', {
      connection: { url: r.url, maxRetriesPerRequest: null },
    });
    const job = await queue.add('probe', { hello: 'world' });
    expect(job.id).toBeTruthy();
    await queue.close();
  });
});
```

- [ ] **Step 2: Add `bullmq` as a devDependency for the self-test**

In `packages/test-support/package.json`, add to `devDependencies`: `"bullmq": "^5.0.0"`. Then run `pnpm install`.
Expected: installs without error.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @autodidact/test-support test -- redis`
Expected: FAIL — `Cannot find module '../redis.ts'`.

- [ ] **Step 4: Implement `src/redis.ts`**

```ts
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';

export interface TestRedis {
  /** redis:// connection URL for ioredis / BullMQ. */
  url: string;
  /** The running Redis container. */
  container: StartedRedisContainer;
  /** Stop the container. Call in afterAll. */
  close: () => Promise<void>;
}

/** Boot a Redis container for BullMQ integration tests. */
export async function withTestRedis(): Promise<TestRedis> {
  const container = await new RedisContainer('redis:7-alpine').start();
  const url = container.getConnectionUrl();
  const close = async () => {
    await container.stop();
  };
  return { url, container, close };
}
```

- [ ] **Step 5: Extend the barrel** — append to `src/index.ts`

```ts
export { withTestRedis, type TestRedis } from './redis.ts';
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @autodidact/test-support test -- redis`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/test-support/src/redis.ts packages/test-support/src/__tests__/redis.test.ts packages/test-support/src/index.ts packages/test-support/package.json pnpm-lock.yaml
git commit -m "feat(test-support): add withTestRedis harness for BullMQ"
```

---

### Task 5: Refactor the existing progress integration test to consume the harness

This proves the extraction works end-to-end and removes the duplicated inline setup. The `vi.mock('@autodidact/db')` redirect stays — it is the per-file boilerplate that points `getDb()` at the harness `db`.

**Files:**
- Modify: `services/api/package.json` (add devDependency)
- Modify: `services/api/src/__tests__/progress.service.integration.test.ts`

- [ ] **Step 1: Add the devDependency**

In `services/api/package.json`, add to `devDependencies`: `"@autodidact/test-support": "workspace:*"`. Run `pnpm install`.
Expected: links without error.

- [ ] **Step 2: Build test-support so the api test resolves it via dist**

Run: `pnpm --filter @autodidact/test-support build`
Expected: emits `packages/test-support/dist/`. (Under `pnpm test`, Turbo's `dependsOn` build does this automatically; building here makes the next manual run resolvable.)

- [ ] **Step 3: Rewrite the test setup to use the harness** — replace lines 1–137 of `services/api/src/__tests__/progress.service.integration.test.ts` (everything from the imports through the last inline `createModuleProgress` helper, i.e. up to but not including the first `describe(`) with:

```ts
import 'reflect-metadata';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  withTestDatabase,
  type TestDatabase,
  seedUser,
  seedCourse,
  seedModules,
  seedEnrollment,
  seedModuleProgress,
} from '@autodidact/test-support';

// Harness is assigned in beforeAll; the @autodidact/db mock defers getDb() to call time.
let harness: TestDatabase;

vi.mock('@autodidact/db', async () => {
  const { eq, and, sql, or, inArray, desc, asc, gt, lt, gte, lte } = await import('drizzle-orm');
  const schema = await import('../../../../packages/db/src/schema/index.js');
  return {
    ...schema,
    eq, and, sql, or, inArray, desc, asc, gt, lt, gte, lte,
    getDb: () => harness.db,
    supabaseAdmin: null,
  };
});

import { moduleProgress, enrollments, eq, and } from '@autodidact/db';
import { ProgressService } from '../modules/progress/progress.service.js';

beforeAll(async () => {
  harness = await withTestDatabase();
}, 90_000);

afterAll(async () => {
  await harness?.close();
});
```

- [ ] **Step 4: Update the two `describe` blocks to use the seed factories and `harness.db`**

In both `describe` blocks: replace `await truncateTables();` with `await harness.truncate();`; replace `const user = await createUser();` with `const user = await seedUser(harness.db);`; replace `const course = await createCourse(user.id);` with `const course = await seedCourse(harness.db, user.id);`. Inside the `it` cases replace `createModules(courseId, N)` → `seedModules(harness.db, courseId, N)`, `createEnrollment(userId, courseId)` → `seedEnrollment(harness.db, userId, courseId)`, `createModuleProgress(userId, courseId, mods)` → `seedModuleProgress(harness.db, userId, courseId, mods)`, and every `testDb` reference in assertions → `harness.db`. (The `users`, `courses`, `modules` table imports are no longer needed; keep only `moduleProgress`, `enrollments`, `eq`, `and`.)

- [ ] **Step 5: Run the test to verify it still passes**

Run: `pnpm --filter @autodidact/api test -- progress.service.integration`
Expected: PASS — all 6 cases green, now running against a DB with **all** migrations (indexes + RLS) applied, not just `0001`.

- [ ] **Step 6: Commit**

```bash
git add services/api/package.json services/api/src/__tests__/progress.service.integration.test.ts pnpm-lock.yaml
git commit -m "refactor(api): consume test-support harness in progress integration test"
```

---

### Task 6: Plumb coverage-threshold support into the Vitest base config (soft)

Enables per-package `coverage.thresholds` without losing the base `provider`/`reporter`/`exclude`. No failing numbers are set in Phase 0 — enforcement lands in Phase 5.

**Files:**
- Modify: `packages/config/vitest.base.ts`
- Create: `packages/config/src/__tests__/vitest-base.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/config/src/__tests__/vitest-base.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { createBaseConfig } from '../../vitest.base.ts';

// createBaseConfig returns a Vite UserConfig object; assert the merged shape.
function coverageOf(config: unknown): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (config as any).test.coverage;
}

describe('createBaseConfig coverage merge', () => {
  it('keeps base provider/reporter when a package overrides only thresholds', () => {
    const config = createBaseConfig({
      test: { coverage: { thresholds: { lines: 80 } } },
    });
    const coverage = coverageOf(config);
    expect(coverage.provider).toBe('v8');
    expect(coverage.reporter).toEqual(['text', 'lcov']);
    expect(coverage.thresholds).toEqual({ lines: 80 });
  });

  it('preserves the base exclude list under override', () => {
    const config = createBaseConfig({
      test: { coverage: { thresholds: { lines: 50 } } },
    });
    const coverage = coverageOf(config);
    expect(coverage.exclude).toContain('**/node_modules/**');
  });
});
```

- [ ] **Step 2: Add a `vitest.config.ts` for the config package if absent**

Check `packages/config/vitest.config.ts`. If it does not exist, create it:

```ts
import { createBaseConfig } from './vitest.base.ts';

export default createBaseConfig({
  test: {
    name: 'config',
    include: ['src/__tests__/**/*.test.ts'],
  },
});
```

If created, also add `'packages/config/vitest.config.ts',` to `vitest.workspace.ts` (first entry).

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @autodidact/config test -- vitest-base`
Expected: FAIL — `coverage.thresholds` is `undefined` because the current `createBaseConfig` replaces the whole `coverage` object with the override (it spreads `testOverrides` over `test`, clobbering `coverage`).

- [ ] **Step 4: Implement the deep merge** — replace the body of `createBaseConfig` in `packages/config/vitest.base.ts`

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createBaseConfig(overrides: Record<string, any> = {}) {
  const { test: testOverrides = {}, ...restOverrides } = overrides;
  const { coverage: coverageOverrides = {}, ...restTest } = testOverrides;
  return defineConfig({
    plugins: [tsconfigPaths()],
    test: {
      globals: true,
      environment: 'node',
      reporters: ['verbose'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov'],
        exclude: [
          '**/dist/**',
          '**/__tests__/**',
          '**/vitest.config.ts',
          '**/vitest.workspace.ts',
          '**/node_modules/**',
        ],
        ...coverageOverrides,
      },
      ...restTest,
    },
    ...restOverrides,
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @autodidact/config test -- vitest-base`
Expected: PASS (both cases).

- [ ] **Step 6: Verify no existing config regressed**

Run: `pnpm --filter @autodidact/config typecheck && pnpm --filter @autodidact/config lint`
Expected: PASS (per `packages/config/CLAUDE.md`, changes here must pass typecheck + lint).

- [ ] **Step 7: Commit**

```bash
git add packages/config/vitest.base.ts packages/config/src/__tests__/vitest-base.test.ts packages/config/vitest.config.ts vitest.workspace.ts
git commit -m "feat(config): deep-merge coverage overrides for per-package thresholds"
```

---

### Task 7: Record the two deferred ADRs

ADR-018 explicitly left mobile testing and e2e to "their own ADR." Record both now so Phases 3–4 reference accepted decisions. Use the personal `write-adr` skill (it owns the template, numbering, and index update).

**Files:**
- Create: `docs/architecture/ADRs/cross-cutting/ADR-021-mobile-testing-second-runner.md`
- Create: `docs/architecture/ADRs/cross-cutting/ADR-022-e2e-testing-strategy.md`

- [ ] **Step 1: Confirm the next ADR numbers**

Run: `ls docs/architecture/ADRs/cross-cutting/`
Expected: highest existing is ADR-020. Use 021 and 022. If the numbering differs, use the next two free numbers and adjust filenames.

- [ ] **Step 2: Draft ADR-021 (mobile testing + second runner) via the write-adr skill**

Invoke the `write-adr` skill. Capture:
- **Title:** Mobile testing strategy and second test runner
- **Status:** Accepted (2026-06-01)
- **Context:** `apps/mobile` has 32 source files and zero tests; ADR-018 deferred mobile testing. Vitest is the backend runner but Expo/React Native's canonical testing path is Jest via the `jest-expo` preset; running RN components under Vitest is unsupported/brittle.
- **Decision:** Adopt `jest-expo` + `@testing-library/react-native` for mobile unit/component tests and **Maestro** for mobile e2e. This introduces Jest as a second runner, scoped strictly to `apps/mobile`; all backend packages/services stay on Vitest.
- **Consequences:** (+) idiomatic Expo testing, strong RN ecosystem support, low-ceremony e2e. (−) two test runners to maintain; mobile coverage reported separately and merged in CI. **Boundary invariant:** Jest is confined to `apps/mobile`; no backend package may adopt it.
- **Alternatives rejected:** Vitest for RN (poor RN/Expo support); Detox for e2e (heavier native-build setup than Maestro).

- [ ] **Step 3: Draft ADR-022 (e2e strategy) via the write-adr skill**

Invoke the `write-adr` skill. Capture:
- **Title:** End-to-end testing strategy
- **Status:** Accepted (2026-06-01)
- **Context:** No e2e tests exist; service-to-service contracts are exercised only via mocked `fetch`. ADR-018 deferred e2e.
- **Decision:** Three e2e layers — **API-level** (`supertest` against a real NestJS app + Testcontainers Postgres/Redis, LLM mocked), **cross-service** (api↔agent↔worker via a compose/Testcontainers harness with `LLM_PROVIDER=mock`), and **mobile** (Maestro). The model is the single mock seam at each layer; everything else runs real. A tiny opt-in **live smoke** suite (`LIVE_SMOKE=1`, nightly/manual) hits the real provider for contract sanity and never runs on PRs.
- **Consequences:** (+) high-fidelity regression net catching contract drift; deterministic and zero-cost on PRs. (−) added CI complexity (real infra services, compose). **Invariant:** PR pipelines never call a real LLM provider.
- **Alternatives rejected:** stubbed-`fetch` "e2e" (already the gap); full-journey-against-real-OpenAI on every PR (cost + flakiness).

- [ ] **Step 4: Verify the ADRs render and are indexed**

Run: `ls docs/architecture/ADRs/cross-cutting/ | grep -E 'ADR-02[12]'`
Expected: both files present. Confirm any ADR index/README the skill maintains lists them.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/ADRs/
git commit -m "docs(adr): record ADR-021 mobile testing and ADR-022 e2e strategy"
```

---

### Task 8: Add package docs and run the full gate

**Files:**
- Create: `packages/test-support/README.md`
- Create: `packages/test-support/CLAUDE.md`

- [ ] **Step 1: Write `packages/test-support/README.md`**

```markdown
# @autodidact/test-support

Shared Testcontainers harness for real-DB and real-Redis integration tests.

> Agent-binding rules: see `CLAUDE.md`. Canonical mocks live in `@autodidact/config/test-utils` — this package provides *real* infrastructure, not mocks.

## What it provides

- `withTestDatabase()` — boots a `pgvector/pgvector:pg16` container, applies `docker/dev-db-init.sql` (extensions + Supabase `auth.*` stubs) then every migration (`0001`→`0004`), and returns `{ db, pool, container, truncate, close }`.
- `seedUser` / `seedCourse` / `seedModules` / `seedEnrollment` / `seedModuleProgress` — typed row builders that take the `db` from the harness.
- `withTestRedis()` — boots a Redis container and returns `{ url, container, close }` for BullMQ tests.

## Usage

```ts
import { withTestDatabase, seedUser, type TestDatabase } from '@autodidact/test-support';

let h: TestDatabase;
beforeAll(async () => { h = await withTestDatabase(); }, 90_000);
afterAll(async () => { await h.close(); });
beforeEach(async () => { await h.truncate(); });
```

For a service whose code-under-test calls `getDb()`, keep the thin per-file redirect:

```ts
vi.mock('@autodidact/db', async () => {
  const schema = await import('../../../../packages/db/src/schema/index.js');
  return { ...schema, getDb: () => h.db, supabaseAdmin: null };
});
```

## Why a real DB

pgvector, index, and RLS behaviour cannot be exercised through mocks (ADR-018). This package makes the one-container pattern reusable across every service.
```

- [ ] **Step 2: Write `packages/test-support/CLAUDE.md`**

```markdown
# Subtree Instructions — packages/test-support/

> These rules apply only within `packages/test-support/`. They extend the root `CLAUDE.md`.

## Purpose

Real infrastructure harness (Postgres + Redis via Testcontainers) and seed factories for integration and e2e tests across the monorepo.

## Invariants (must not be broken)

- This package provides **real** infrastructure, never mocks. Mocks live in `@autodidact/config/test-utils` — do not duplicate them here.
- `withTestDatabase()` MUST apply `docker/dev-db-init.sql` before migrations; the RLS migrations (`0003`/`0004`) reference `auth.uid()`/`auth.role()` and fail to compile without the stubs.
- `withTestDatabase()` applies **all** migrations, not a subset — index and RLS coverage is the point.
- Keep `TRUNCATE_TABLES` in `src/database.ts` in sync with `packages/db/src/schema` when tables are added.
- Seed factories take an explicit `db` argument; they must not depend on `getDb()` or any `vi.mock` state.

## Verification

```bash
pnpm --filter @autodidact/test-support test       # harness self-tests (boots containers)
pnpm --filter @autodidact/test-support typecheck
pnpm --filter @autodidact/test-support lint
```

## Source of truth

- DB schema / migrations: `@autodidact/db` (this package only consumes them).
- Auth stubs: `docker/dev-db-init.sql`.
```

- [ ] **Step 3: Run the full test gate**

Run: `pnpm test`
Expected: PASS across all workspaces, including the new `test-support` suites and the refactored api integration test. (Turbo builds `test-support` before dependent tests.)

- [ ] **Step 4: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/test-support/README.md packages/test-support/CLAUDE.md
git commit -m "docs(test-support): add README and CLAUDE.md"
```

---

## Self-Review

**Spec coverage (Phase 0 items):**
- `packages/test-support` foundation — Tasks 1–4, 8. ✓
- `withTestDatabase()` runs all migrations — Task 2 (with `dev-db-init.sql` gotcha handled). ✓
- `withTestRedis()` — Task 4. ✓
- Seed factories composing existing fixtures — Task 3 (note: existing `sampleUser`/`sampleBlueprint` are static objects in `@autodidact/config`; the DB seed factories are the row-inserting complement and intentionally live here, not there, per the config-package invariant against DB access). ✓
- Soft coverage scaffolding in `vitest.base.ts` — Task 6 (capability plumbed; numbers deferred to Phase 5 per spec). ✓
- Two ADRs (jest-expo second runner, e2e strategy) — Task 7. ✓
- Refactor proving the harness — Task 5. ✓

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to" — every code step shows complete code; ADR steps enumerate Context/Decision/Consequences/Alternatives rather than deferring. ✓

**Type consistency:** `TestDatabase`, `TestRedis`, `SeededUser/Course/Module/Enrollment` are defined in Tasks 2–4 and consumed with the same names/shapes in Tasks 3 and 5. `withTestDatabase`/`withTestRedis`/`seed*` names are identical across definition, barrel export, and consumer. `close()`/`truncate()` method names are stable throughout. ✓

**Out-of-scope guard:** No service test beyond the progress refactor is touched; no product code changes; coverage numbers not enforced. Matches the spec's Phase 0 boundary.
```
