# @autodidact/test-support

Shared Testcontainers harness for real-DB integration tests.

> Agent-binding rules: see `CLAUDE.md`. Canonical mocks live in `@autodidact/config/test-utils` — this package provides *real* infrastructure, not mocks.

## What it provides

- `withTestDatabase()` — boots a `pgvector/pgvector:pg16` container, applies `docker/dev-db-init.sql` (extensions + Supabase `auth.*` stubs) then every migration (`0001`→`0004`), and returns `{ db, pool, container, truncate, close }`.
- `seedUser` / `seedCourse` / `seedModules` / `seedEnrollment` / `seedModuleProgress` — typed row builders that take the `db` from the harness.

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
