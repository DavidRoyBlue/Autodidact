import { eq, getDb, courses, modules } from '@autodidact/db';
import type { IQueueProvider } from '@autodidact/providers';
import type { CourseGenerationJobData } from '@autodidact/types';
import type { Logger } from '@autodidact/observability';
import { QUEUES, JOB_NAMES } from '../queues/definitions.js';
import type { AgentClient } from '../services/agent.client.js';
import type { AgentPlatformClient } from '../services/agent-platform.client.js';
import { indexModuleChunks } from '../rag/index-chunks.js';

export interface CourseGenerationDeps {
  platformClient: AgentPlatformClient;
  agentClient: AgentClient;
  queueProvider: IQueueProvider;
  logger: Logger;
}

/**
 * Generates a course on AgentPlatform's course-creator workflow (ADR-030) and
 * commits it to the DB. Invoked per-task by the HTTP layer (Cloud Tasks in
 * production, the loopback provider locally). A throw propagates to the route
 * handler, which translates it into a retry (5xx) or — on the final attempt —
 * marks the course 'failed'.
 */
export async function processCourseGeneration(
  data: CourseGenerationJobData,
  { platformClient, agentClient, queueProvider, logger }: CourseGenerationDeps,
): Promise<void> {
  const { courseId, topic } = data;
  const db = getDb();
  logger.info({ courseId, topic }, 'Starting course generation');

  await db
    .update(courses)
    .set({ status: 'generating', updatedAt: new Date() })
    .where(eq(courses.id, courseId));

  const course = await platformClient.generateCourse(data);

  const insertedModules = await db.transaction(async (tx) => {
    // A retry can reach here with modules already committed (e.g. the previous
    // attempt failed on the follow-up enqueue, after this transaction). Delete
    // before insert so a re-run replaces rather than duplicates the module set.
    await tx.delete(modules).where(eq(modules.courseId, courseId));

    await tx
      .update(courses)
      .set({
        title: course.title,
        description: course.description,
        difficulty: course.difficulty,
        estimatedHours: Math.ceil(course.budget.estimated_minutes / 60),
        status: 'ready',
        updatedAt: new Date(),
      })
      .where(eq(courses.id, courseId));

    // the workflow numbers modules from 1; the app from 0
    const moduleRows = course.modules.map((m) => ({
      courseId,
      position: m.position - 1,
      title: m.title,
      description: m.description,
      objectives: m.objectives,
      content: m.content,
      resources: m.resources,
      estimatedMinutes: m.estimated_minutes,
    }));

    return tx
      .insert(modules)
      .values(moduleRows)
      .returning({
        id: modules.id,
        title: modules.title,
        description: modules.description,
        objectives: modules.objectives,
        content: modules.content,
      });
  });

  // RAG indexing (ADR-024): best-effort, AFTER the course-ready commit so a
  // failure here never rolls back the course or triggers a full task retry.
  try {
    await indexModuleChunks(insertedModules, agentClient, logger);
  } catch (err) {
    logger.error({ err, courseId }, 'module content RAG indexing failed (non-fatal)');
  }

  // Retry/backoff for the follow-up task is owned by the Cloud Tasks queue
  // config (infra/modules/cloud-tasks), not enqueue options.
  await queueProvider.enqueue(QUEUES.EMBEDDING, JOB_NAMES.GENERATE_EMBEDDING, {
    courseId,
    topic,
  });

  logger.info({ courseId }, 'Course generation complete');
}
