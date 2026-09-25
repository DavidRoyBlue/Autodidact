import { Injectable } from '@nestjs/common';
import { TeacherReplySchema, type TeacherReply } from '@autodidact/schemas';

const POLL_MS = 1_000;
const TERMINAL = ['completed', 'failed', 'cancelled'];

interface Run {
  id: string;
  status: string;
  output: unknown;
  error: string | null;
}

/**
 * The AgentPlatform `/api/v1` surface the chat uses (ADR-031): one thread per
 * chat session, one `course-teacher` run per learner turn on it. The platform
 * carries the conversation as thread history and validates the reply against
 * the agent's output schema; the app re-parses only what it reads.
 */
@Injectable()
export class ApiPlatformClient {
  private readonly baseUrl = process.env['AGENT_PLATFORM_URL'] ?? 'http://localhost:8400';

  async createThread(title: string): Promise<string> {
    const thread = await this.request<{ id: string }>('POST', '/api/v1/threads', { title, project: 'Autodidact' });
    return thread.id;
  }

  async teach(threadId: string, message: string): Promise<TeacherReply> {
    const run = await this.request<Run>('POST', '/api/v1/runs', {
      agent_id: 'course-teacher',
      thread_id: threadId,
      input: { message },
    });
    const finished = await this.waitFor(run.id);
    if (finished.status !== 'completed') {
      throw new Error(`course-teacher run ${run.id} ${finished.status}: ${finished.error ?? 'no error recorded'}`);
    }
    return TeacherReplySchema.parse(finished.output);
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
