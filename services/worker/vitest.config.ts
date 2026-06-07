import { createBaseConfig } from '../../packages/config/vitest.base.ts';

export default createBaseConfig({
  test: {
    name: 'worker',
    include: ['src/__tests__/**/*.test.ts'],
    // @autodidact/db constructs a Pool and a Supabase client at import time.
    // Provide stub env vars so the module-load side effect doesn't throw.
    env: {
      SUPABASE_URL: 'https://stub.supabase.co',
      SUPABASE_SECRET_KEY: 'stub-key',
    },
    testTimeout: 90_000,
    hookTimeout: 90_000,
  },
});
