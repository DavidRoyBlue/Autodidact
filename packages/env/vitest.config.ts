import { createBaseConfig } from '../config/vitest.base.ts';

export default createBaseConfig({
  test: {
    name: 'env',
    include: ['src/__tests__/**/*.test.ts'],
  },
});
