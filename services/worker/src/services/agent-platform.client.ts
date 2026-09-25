import { GeneratedCourseSchema, type GeneratedCourse } from '@autodidact/schemas';
import type { CourseGenerationJobData, TimeBudget } from '@autodidact/types';

/** Reading speed the whole-course word budget is computed at (per-user rate later). */
const WORDS_PER_MINUTE = 150;
/** Whole-course reading minutes per preset; `unrestricted` has none. */
const BUDGET_MINUTES: Record<Exclude<TimeBudget, 'unrestricted'>, number> = { '30min': 30, '1h': 60, '4h': 240 };
const POLL_MS = 10_000;
const TERMINAL = ['completed', 'failed', 'cancelled'];

interface Run {
  id: string;
  status: string;
  output: unknown;
  error: string | null;
}

/**
 * The AgentPlatform `/api/v1` surface the worker uses (ADR-030): one
 * course-creator workflow run per course, polled to a terminal status. The
 * platform validates the run's output against its own contract; the app
 * re-parses only the fields it persists.
 */
export class AgentPlatformClient {
  constructor(private readonly baseUrl: string) {}

  async generateCourse(job: CourseGenerationJobData): Promise<GeneratedCourse> {
    const minutes = job.timeBudget === 'unrestricted' ? null : BUDGET_MINUTES[job.timeBudget];
    const run = await this.request<Run>('POST', '/api/v1/runs', {
      workflow_id: 'course-creator',
      input: {
        subject: job.topic,
        difficulty: job.difficulty,
        budget: { preset: job.timeBudget, words: minutes === null ? null : minutes * WORDS_PER_MINUTE },
        words_per_minute: WORDS_PER_MINUTE,
      },
    });
    const finished = await this.waitFor(run.id);
    if (finished.status !== 'completed') {
      throw new Error(`course-creator run ${run.id} ${finished.status}: ${finished.error ?? 'no error recorded'}`);
    }
    return GeneratedCourseSchema.parse(finished.output);
  }

  private async waitFor(runId: string): Promise<Run> {
    for (;;) {
      const run = await this.request<Run>('GET', `/api/v1/runs/${runId}`);
      if (TERMINAL.includes(run.status)) return run;
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`AgentPlatform ${method} ${path} failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as T;
  }
}
