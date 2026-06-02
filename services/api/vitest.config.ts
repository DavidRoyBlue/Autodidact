import { createBaseConfig } from '../../packages/config/vitest.base.ts';

export default createBaseConfig({
  test: {
    name: 'api',
    include: ['src/__tests__/**/*.test.ts'],
    setupFiles: ['reflect-metadata'],
    testTimeout: 30000,
    hookTimeout: 60000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // @autodidact/test-support's CJS dist requires @autodidact/db synchronously at module
    // load time, which triggers packages/db/src/supabase.ts to call createClient() before
    // vi.mock('@autodidact/db') can intercept it. These stubs satisfy the Supabase URL
    // validator; the actual client is never used (vi.mock returns supabaseAdmin: null).
    env: {
      SUPABASE_URL: 'https://placeholder.supabase.co',
      SUPABASE_SECRET_KEY: 'placeholder',
    },
  },
});
