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
