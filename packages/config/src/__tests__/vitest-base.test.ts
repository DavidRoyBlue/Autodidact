import { describe, it, expect } from 'vitest';
import { createBaseConfig } from '../../vitest.base.js';

// createBaseConfig returns a Vite UserConfig object; assert the merged shape.
function coverageOf(config: unknown): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (config as any).test.coverage;
}

describe('createBaseConfig coverage merge', () => {
  it('keeps base provider/reporter when a package overrides only thresholds', () => {
    const config = createBaseConfig({
      test: { coverage: { thresholds: { lines: 80 } } },
    });
    const coverage = coverageOf(config);
    expect(coverage.provider).toBe('v8');
    expect(coverage.reporter).toEqual(['text', 'lcov']);
    expect(coverage.thresholds).toEqual({ lines: 80 });
  });

  it('preserves the base exclude list under override', () => {
    const config = createBaseConfig({
      test: { coverage: { thresholds: { lines: 50 } } },
    });
    const coverage = coverageOf(config);
    expect(coverage.exclude).toContain('**/node_modules/**');
  });
});
