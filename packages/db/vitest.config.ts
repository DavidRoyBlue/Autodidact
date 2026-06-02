import { createBaseConfig } from '../config/vitest.base.ts';

export default createBaseConfig({
  test: {
    name: 'db',
    include: ['src/__tests__/**/*.test.ts'],
  },
});
