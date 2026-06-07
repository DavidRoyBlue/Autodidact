import { createBaseConfig } from '../config/vitest.base.ts';

export default createBaseConfig({
  test: {
    name: 'schemas',
    include: ['src/__tests__/**/*.test.ts'],
    // Coverage ratchet floor (see docs/testing-strategy.md). Pure package; the
    // line floor is currently met (~94%) and ratchets toward 100% as the barrel
    // and remaining branches are covered. CI fails on regression below this.
    coverage: {
      thresholds: { lines: 90, statements: 90 },
    },
  },
});
