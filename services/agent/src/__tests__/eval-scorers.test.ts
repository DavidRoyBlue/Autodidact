import { describe, it, expect } from 'vitest';
import {
  scoreNoMarkerLeak,
  scoreCompletionCalibration,
  scoreTutoringRelevance,
  summarize,
} from '../eval/scorers.js';

describe('scoreNoMarkerLeak()', () => {
  it('passes clean tutoring text', () => {
    expect(scoreNoMarkerLeak('Great question! Let us explore closures.').passed).toBe(true);
  });
  it('fails text containing the completion marker', () => {
    const r = scoreNoMarkerLeak('Well done [MODULE_COMPLETE:score=90]');
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
  });
});

describe('scoreCompletionCalibration()', () => {
  it('passes when within tolerance', () => {
    const r = scoreCompletionCalibration(82, 85, 10);
    expect(r.passed).toBe(true);
    expect(r.score).toBeGreaterThan(0.9);
  });
  it('fails when outside tolerance', () => {
    const r = scoreCompletionCalibration(40, 85, 10);
    expect(r.passed).toBe(false);
    expect(r.score).toBeLessThan(0.7);
  });
});

describe('scoreTutoringRelevance()', () => {
  it('rewards a response that touches the objectives', () => {
    const r = scoreTutoringRelevance(
      'A closure captures variables from its surrounding scope.',
      ['Understand closures', 'Explain variable scope'],
    );
    expect(r.score).toBeGreaterThan(0);
    expect(r.passed).toBe(true);
  });
  it('scores zero for an off-topic response', () => {
    const r = scoreTutoringRelevance('The weather is nice today.', ['Understand closures']);
    expect(r.score).toBe(0);
    expect(r.passed).toBe(false);
  });
});

describe('summarize()', () => {
  it('aggregates pass rate and average score across results', () => {
    const s = summarize([
      { name: 'a', score: 1, passed: true },
      { name: 'b', score: 0, passed: false },
      { name: 'a', score: 1, passed: true },
    ]);
    expect(s.total).toBe(3);
    expect(s.passRate).toBeCloseTo(2 / 3, 5);
    expect(s.byName['a']!.passRate).toBe(1);
    expect(s.byName['b']!.passRate).toBe(0);
  });
});
