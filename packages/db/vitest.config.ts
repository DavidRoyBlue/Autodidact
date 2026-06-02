import { createBaseConfig } from '../config/vitest.base.ts';

export default createBaseConfig({
  test: {
    name: 'db',
    include: ['src/__tests__/**/*.test.ts'],
    // Env stubs prevent @autodidact/db module-load side effects from throwing
    // when the Pool + Supabase client are constructed at import time.
    // Integration tests use harness.db / harness.pool, not the singleton.
    env: {
      SUPABASE_URL: 'https://stub.supabase.co',
      SUPABASE_SECRET_KEY: 'stub-key',
      DATABASE_URL: 'postgres://stub',
    },
    testTimeout: 90_000,
    hookTimeout: 90_000,
  },
});
