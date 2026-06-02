import { createBaseConfig } from './vitest.base.ts';

export default createBaseConfig({
  test: {
    name: 'config',
    include: ['src/__tests__/**/*.test.ts'],
  },
});
