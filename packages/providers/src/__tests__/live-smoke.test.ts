/**
 * Live provider-contract smoke test.
 *
 * Opt-in only: runs against the REAL OpenAI API. It is skipped unless both
 * `LIVE_SMOKE=1` and `OPENAI_API_KEY` are set, so it never runs on PRs or in the
 * default `pnpm test` gate — only in the scheduled nightly workflow.
 *
 * Scope is intentionally tiny: verify the embedding provider still returns a
 * vector of the expected dimensionality (a contract/shape check, not a journey).
 */
import { describe, it, expect } from 'vitest';
import { createEmbeddingProvider } from '../factory.js';

const LIVE = process.env['LIVE_SMOKE'] === '1' && !!process.env['OPENAI_API_KEY'];

describe.runIf(LIVE)('live smoke: OpenAI embedding provider', () => {
  it('returns a 1536-dim embedding for a short text', async () => {
    const provider = createEmbeddingProvider({ embeddingProvider: 'openai' });
    const vector = await provider.embed('hello world');
    expect(Array.isArray(vector)).toBe(true);
    expect(vector).toHaveLength(1536);
    expect(vector.every((n) => typeof n === 'number')).toBe(true);
  }, 30_000);
});

// Guard so the file is never an empty suite when LIVE is false.
describe('live smoke gating', () => {
  it('is opt-in (LIVE_SMOKE=1 + OPENAI_API_KEY)', () => {
    expect(typeof LIVE).toBe('boolean');
  });
});
