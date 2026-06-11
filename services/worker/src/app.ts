import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { and, eq, inArray, getDb, courses } from '@autodidact/db';
import type { IQueueProvider } from '@autodidact/providers';
import type { Logger } from '@autodidact/observability';
import { CourseGenerationJobSchema, EmbeddingJobSchema } from '@autodidact/schemas';
import type { AgentClient } from './services/agent.client.js';
import { processCourseGeneration } from './processors/course-generation.processor.js';
import { processEmbedding } from './processors/embedding.processor.js';
import { JOB_NAMES } from './queues/definitions.js';

export interface AppDeps {
  agentClient: AgentClient;
  queueProvider: IQueueProvider;
  logger: Logger;
  /** Mirrors max_attempts in the Cloud Tasks queue retry_config. */
  maxAttempts: number;
}

/**
 * Cloud Tasks sets this to the number of retries so far: 0 on the first
 * attempt, max_attempts - 1 on the last. The loopback provider (local dev)
 * sends no header — every dispatch is the single, final attempt.
 */
const RETRY_COUNT_HEADER = 'x-cloudtasks-taskretrycount';

function isFinalAttempt(req: FastifyRequest, maxAttempts: number): boolean {
  const raw = req.headers[RETRY_COUNT_HEADER];
  if (raw === undefined) return true;
  const retryCount = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isNaN(retryCount) || retryCount >= maxAttempts - 1;
}

/**
 * Failure recovery: a course whose generation has exhausted its retries must
 * not sit in 'generating' forever. Guarded so a course that already reached
 * 'ready' (e.g. the throw happened after the commit) is never flipped back.
 */
async function markCourseFailed(courseId: string, logger: Logger): Promise<void> {
  try {
    const db = getDb();
    await db
      .update(courses)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(and(eq(courses.id, courseId), inArray(courses.status, ['pending', 'generating'])));
    logger.info({ courseId }, 'Course marked as failed after final attempt');
  } catch (err) {
    logger.error({ err, courseId }, 'Failed to mark course as failed');
  }
}

/**
 * Builds the worker's Fastify app: one POST route per task type, invoked by
 * Cloud Tasks (prod, IAM-authenticated at the Cloud Run layer) or the
 * loopback queue provider (dev). Response codes drive queue behaviour:
 * 2xx acknowledges the task; 5xx asks the queue to retry.
 */
export function buildApp(deps: AppDeps): FastifyInstance {
  const { agentClient, queueProvider, logger, maxAttempts } = deps;
  const app = Fastify({ logger: false });

  app.get('/health', () => ({ status: 'ok' }));

  app.post(`/tasks/${JOB_NAMES.GENERATE_COURSE}`, async (req, reply) => {
    const parsed = CourseGenerationJobSchema.safeParse(req.body);
    if (!parsed.success) {
      logger.error({ issues: parsed.error.issues }, 'Invalid generate-course payload');
      return reply.code(400).send({ error: 'invalid payload' });
    }

    try {
      await processCourseGeneration(parsed.data, { agentClient, queueProvider, logger });
      return await reply.code(204).send();
    } catch (err) {
      logger.error({ err, courseId: parsed.data.courseId }, 'Course generation task failed');
      if (isFinalAttempt(req, maxAttempts)) {
        await markCourseFailed(parsed.data.courseId, logger);
        // 200 acknowledges the task so the queue stops retrying a lost cause.
        return reply.code(200).send({ status: 'failed' });
      }
      return reply.code(500).send({ error: 'task failed' });
    }
  });

  app.post(`/tasks/${JOB_NAMES.GENERATE_EMBEDDING}`, async (req, reply) => {
    const parsed = EmbeddingJobSchema.safeParse(req.body);
    if (!parsed.success) {
      logger.error({ issues: parsed.error.issues }, 'Invalid generate-embedding payload');
      return reply.code(400).send({ error: 'invalid payload' });
    }

    try {
      await processEmbedding(parsed.data, { agentClient, logger });
      return await reply.code(204).send();
    } catch (err) {
      logger.error({ err, courseId: parsed.data.courseId }, 'Embedding task failed');
      if (isFinalAttempt(req, maxAttempts)) {
        // The course stays 'ready' — only similarity reuse is degraded until
        // the embedding is regenerated. Acknowledge to stop retries.
        return reply.code(200).send({ status: 'failed' });
      }
      return reply.code(500).send({ error: 'task failed' });
    }
  });

  return app;
}
