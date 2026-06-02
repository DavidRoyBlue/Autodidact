import { createBaseConfig } from '../../packages/config/vitest.base.ts';

export default createBaseConfig({
  test: {
    name: 'mobile',
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
