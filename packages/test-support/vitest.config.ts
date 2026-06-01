import { createBaseConfig } from '../config/vitest.base.ts';

export default createBaseConfig({
  test: {
    name: 'test-support',
    include: ['src/__tests__/**/*.test.ts'],
    // Container boot dominates wall-clock; give suites room.
    testTimeout: 90_000,
    hookTimeout: 90_000,
    env: {
      // @autodidact/db imports supabaseAdmin at module load; stub url/key so the
      // Supabase client initializes without throwing. The supabaseAdmin client is
      // never called in this package — we connect directly via pool/drizzle.
      SUPABASE_URL: 'https://stub.supabase.co',
      SUPABASE_SECRET_KEY: 'stub-key',
    },
  },
});
