/**
 * Agent eval runner — the regression gate for capability phases.
 *
 * Runs the course-generation and module-chat graphs against the seed datasets,
 * applies the pure scorers, prints a summary, and exits non-zero if any scorer's
 * pass rate falls below its threshold.
 *
 * Requires a live LLM (OPENAI_API_KEY, or the configured LLM_PROVIDER's key).
 * Without one it prints a skip notice and exits 0, so CI without secrets is not
 * blocked. Set LANGCHAIN_TRACING_V2=true + LANGSMITH_API_KEY to capture each run
 * in LangSmith (handled automatically by LangChain — no code change needed).
 *
 * Usage: `pnpm eval` (root — builds first, then runs the compiled runner).
 * Runs as compiled output (`node dist/eval/run.js`), not tsx — see README.md.
 */
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { createLLMProvider, createCheckpointer } from '@autodidact/providers';
import { createLogger } from '@autodidact/observability';
import { buildCourseGenerationGraph } from '../graphs/course-generation/graph.js';
import { buildModuleChatGraph } from '../graphs/module-chat/graph.js';
import {
  scoreBlueprintSchema,
  scoreBlueprintQuality,
  scoreNoMarkerLeak,
  scoreTutoringRelevance,
  scoreCompletionCalibration,
  summarize,
  type ScoreResult,
} from './scorers.js';
import { COURSE_GEN_CASES, TUTORING_CASES } from './datasets.js';

// Minimum pass rate per scorer for the run to be considered a non-regression.
const THRESHOLDS: Record<string, number> = {
  blueprint_schema: 1.0,
  blueprint_quality: 0.75,
  no_marker_leak: 1.0,
  tutoring_relevance: 0.75,
  completion_calibration: 0.5,
};

function hasApiKey(): boolean {
  const provider = process.env['LLM_PROVIDER'] ?? 'openai';
  return Boolean(
    provider === 'anthropic' ? process.env['ANTHROPIC_API_KEY'] : process.env['OPENAI_API_KEY'],
  );
}

async function main(): Promise<void> {
  const logger = createLogger('agent-eval');

  if (!hasApiKey()) {
    logger.warn(
      'No LLM API key set (OPENAI_API_KEY / ANTHROPIC_API_KEY). Skipping eval run. ' +
        'Scorers remain unit-tested; set a key to exercise the live regression gate.',
    );
    return;
  }

  const llm = createLLMProvider({});
  const checkpointer = createCheckpointer({ checkpointer: 'memory' });
  await checkpointer.init();

  const results: ScoreResult[] = [];

  // Course generation
  const courseGraph = buildCourseGenerationGraph(llm, logger);
  for (const c of COURSE_GEN_CASES) {
    const out = await courseGraph.invoke({
      topic: c.topic,
      difficulty: c.difficulty,
      moduleCount: c.moduleCount,
      blueprint: null,
      retryCount: 0,
      error: null,
    });
    results.push(scoreBlueprintSchema(out.blueprint));
    if (out.blueprint) results.push(scoreBlueprintQuality(out.blueprint, { moduleCount: c.moduleCount }));
    logger.info({ case: c.id, ok: Boolean(out.blueprint) }, 'course-gen case scored');
  }

  // Tutoring
  const chatGraph = buildModuleChatGraph(llm, checkpointer, logger);
  for (const t of TUTORING_CASES) {
    const config = { configurable: { thread_id: `eval-${t.id}` } };
    const out = await chatGraph.invoke(
      {
        messages: [new HumanMessage(t.message)],
        moduleBlueprint: { objectives: t.objectives } as never,
        courseProgress: { courseTitle: 'Eval', completedModuleCount: 0, totalModuleCount: 1 },
        completionSignaled: false,
        completionScore: null,
        teachingPhase: 'teaching',
      },
      config,
    );
    const last = [...out.messages].reverse().find((m) => m instanceof AIMessage);
    const text = typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '');
    results.push(scoreNoMarkerLeak(text));
    results.push(scoreTutoringRelevance(text, t.objectives));
    if (typeof t.expectedCompletionScore === 'number' && typeof out.completionScore === 'number') {
      results.push(scoreCompletionCalibration(out.completionScore, t.expectedCompletionScore));
    }
    logger.info({ case: t.id }, 'tutoring case scored');
  }

  const summary = summarize(results);
  // eslint-disable-next-line no-console
  console.table(
    Object.fromEntries(
      Object.entries(summary.byName).map(([name, s]) => [
        name,
        { passRate: s.passRate.toFixed(2), avgScore: s.avgScore.toFixed(2), n: s.total },
      ]),
    ),
  );

  const regressions = Object.entries(summary.byName).filter(
    ([name, s]) => s.passRate < (THRESHOLDS[name] ?? 0),
  );
  if (regressions.length > 0) {
    logger.error({ regressions: regressions.map(([n]) => n) }, 'eval regression gate FAILED');
    process.exit(1);
  }
  logger.info({ passRate: summary.passRate.toFixed(2) }, 'eval regression gate passed');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('eval run failed:', err);
  process.exit(1);
});
