import { describe, it, expect } from 'vitest';
import { StaleAnonymousCleanupJobSchema } from '../jobs.js';

describe('StaleAnonymousCleanupJobSchema', () => {
  it('accepts an empty object (retentionDays optional)', () => {
    expect(StaleAnonymousCleanupJobSchema.parse({})).toEqual({});
  });
  it('accepts a positive integer retentionDays', () => {
    expect(StaleAnonymousCleanupJobSchema.parse({ retentionDays: 90 })).toEqual({ retentionDays: 90 });
  });
  it('rejects zero / negative / non-integer', () => {
    expect(StaleAnonymousCleanupJobSchema.safeParse({ retentionDays: 0 }).success).toBe(false);
    expect(StaleAnonymousCleanupJobSchema.safeParse({ retentionDays: -1 }).success).toBe(false);
    expect(StaleAnonymousCleanupJobSchema.safeParse({ retentionDays: 1.5 }).success).toBe(false);
  });
});
