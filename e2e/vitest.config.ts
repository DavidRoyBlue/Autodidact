import { createBaseConfig } from '../packages/config/vitest.base.ts';

export default createBaseConfig({
  test: {
    name: 'e2e',
    include: ['src/__tests__/**/*.test.ts'],
    // Booting three child-process services + Testcontainers Postgres/Redis is slow.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // The test process imports @autodidact/test-support → @autodidact/db, which
    // constructs a Supabase client at module load. These stubs satisfy the URL
    // validator; the client is never used (assertions go through harness.db).
    env: {
      SUPABASE_URL: 'https://placeholder.supabase.co',
      SUPABASE_SECRET_KEY: 'placeholder',
    },
  },
});
