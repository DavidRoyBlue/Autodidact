import { describe, it, expect } from 'vitest';
import { toErrorEvent, type ClientErrorCode } from '../errors.js';

const cases: Array<{ name: string; err: unknown; code: ClientErrorCode }> = [
  { name: 'HTTP 429', err: { status: 429 }, code: 'rate_limited' },
  { name: 'HTTP 503', err: { status: 503 }, code: 'upstream_unavailable' },
  { name: 'network ECONNRESET', err: { code: 'ECONNRESET' }, code: 'upstream_unavailable' },
  { name: 'timeout', err: new Error('LLM call timed out after 60000ms'), code: 'timeout' },
  { name: 'HTTP 400', err: { status: 400 }, code: 'invalid_request' },
  { name: 'HTTP 422', err: { status: 422 }, code: 'invalid_request' },
  { name: 'unknown', err: new Error('connection string postgres://user:pw@host'), code: 'internal' },
];

describe('toErrorEvent()', () => {
  for (const { name, err, code } of cases) {
    it(`classifies ${name} as "${code}"`, () => {
      const event = toErrorEvent(err);
      expect(event.type).toBe('error');
      expect(event.code).toBe(code);
    });
  }

  it('never leaks the raw error detail in the client message', () => {
    const event = toErrorEvent(new Error('connection string postgres://user:pw@secret-host'));
    expect(event.message).not.toMatch(/postgres:\/\//);
    expect(event.message).not.toMatch(/secret-host/);
    expect(event.message.length).toBeGreaterThan(0);
  });

  it('produces a safe, human-readable message for every code', () => {
    for (const { err } of cases) {
      const event = toErrorEvent(err);
      expect(typeof event.message).toBe('string');
      expect(event.message.length).toBeGreaterThan(0);
    }
  });
});
