import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/config/vitest.config.ts',
  'packages/schemas/vitest.config.ts',
  'packages/db/vitest.config.ts',
  'packages/providers/vitest.config.ts',
  'packages/prompts/vitest.config.ts',
  'packages/observability/vitest.config.ts',
  'packages/test-support/vitest.config.ts',
  'services/agent/vitest.config.ts',
  'services/worker/vitest.config.ts',
  'services/api/vitest.config.ts',
]);
