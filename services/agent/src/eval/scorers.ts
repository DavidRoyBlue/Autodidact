import { CourseBlueprintSchema } from '@autodidact/schemas';

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

/** 1 if the blueprint satisfies CourseBlueprintSchema, else 0. */
export function scoreBlueprintSchema(blueprint: unknown): ScoreResult {
  const parsed = CourseBlueprintSchema.safeParse(blueprint);
  return {
    name: 'blueprint_schema',
    score: parsed.success ? 1 : 0,
    passed: parsed.success,
    detail: parsed.success ? undefined : parsed.error.issues[0]?.message,
  };
}

/**
 * Heuristic structural quality of a blueprint: requested module count honored,
 * every module has at least one objective and a non-empty content outline, and
 * module titles are unique. Score is the fraction of checks that pass.
 */
export function scoreBlueprintQuality(
  blueprint: { modules?: Array<{ title?: string; objectives?: unknown[]; contentOutline?: unknown[] }> },
  request: { moduleCount: number },
): ScoreResult {
  const modules = blueprint.modules ?? [];
  const titles = modules.map((m) => m.title);
  const checks = [
    modules.length === request.moduleCount,
    modules.length > 0 && modules.every((m) => (m.objectives?.length ?? 0) >= 1),
    modules.length > 0 && modules.every((m) => (m.contentOutline?.length ?? 0) >= 1),
    new Set(titles).size === titles.length && titles.length > 0,
  ];
  const score = checks.filter(Boolean).length / checks.length;
  return { name: 'blueprint_quality', score, passed: score >= 0.75 };
}

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
