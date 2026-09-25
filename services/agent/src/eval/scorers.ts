/**
 * Pure, deterministic scorers for the agent eval harness. Each returns a 0–1
 * score and a pass/fail verdict so results can be aggregated into a regression
 * gate. Scorers never call an LLM — they grade an already-produced output, so
 * they are fully unit-testable offline. (The optional LLM-judge scorer for
 * subjective tutoring quality lives in the runner, behind an API-key gate.)
 */
export interface ScoreResult {
  name: string;
  score: number;
  passed: boolean;
  detail?: string;
}

const COMPLETION_MARKER = /\[MODULE_COMPLETE:/;

/** 1 if the user-facing text does NOT leak the internal completion marker. */
export function scoreNoMarkerLeak(text: string): ScoreResult {
  const leaked = COMPLETION_MARKER.test(text);
  return { name: 'no_marker_leak', score: leaked ? 0 : 1, passed: !leaked };
}

/**
 * How well an evaluator's completion score matches an expected score. Passes
 * when within `tolerance`; score decays linearly with the absolute error.
 */
export function scoreCompletionCalibration(
  actual: number,
  expected: number,
  tolerance = 10,
): ScoreResult {
  const error = Math.abs(actual - expected);
  return {
    name: 'completion_calibration',
    score: Math.max(0, 1 - error / 100),
    passed: error <= tolerance,
    detail: `error=${error}`,
  };
}

/**
 * Heuristic relevance of a tutoring response to the module objectives: the
 * fraction of objectives whose salient words appear in the response. A cheap
 * offline proxy for "did the tutor address what it should"; the runner can
 * layer an LLM judge on top when keys are available.
 */
export function scoreTutoringRelevance(response: string, objectives: string[]): ScoreResult {
  if (objectives.length === 0) {
    return { name: 'tutoring_relevance', score: 0, passed: false };
  }
  const haystack = response.toLowerCase();
  const stop = new Set(['the', 'and', 'for', 'with', 'use', 'your', 'about', 'understand', 'explain']);
  const matched = objectives.filter((obj) => {
    const words = obj
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3 && !stop.has(w));
    return words.some((w) => haystack.includes(w));
  }).length;
  const score = matched / objectives.length;
  return { name: 'tutoring_relevance', score, passed: score > 0 };
}

export interface Summary {
  total: number;
  passRate: number;
  avgScore: number;
  byName: Record<string, { total: number; passRate: number; avgScore: number }>;
}

/** Aggregate a flat list of score results into overall + per-scorer rollups. */
export function summarize(results: ScoreResult[]): Summary {
  const byName: Summary['byName'] = {};
  for (const r of results) {
    const bucket = (byName[r.name] ??= { total: 0, passRate: 0, avgScore: 0 });
    bucket.total += 1;
    bucket.passRate += r.passed ? 1 : 0;
    bucket.avgScore += r.score;
  }
  for (const bucket of Object.values(byName)) {
    bucket.passRate /= bucket.total;
    bucket.avgScore /= bucket.total;
  }
  const total = results.length;
  return {
    total,
    passRate: total ? results.filter((r) => r.passed).length / total : 0,
    avgScore: total ? results.reduce((s, r) => s + r.score, 0) / total : 0,
    byName,
  };
}
