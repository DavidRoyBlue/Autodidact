import { eq, getDb, courses, modules } from '@autodidact/db';
import type { IQueueProvider } from '@autodidact/providers';
import type { CourseGenerationJobData, ModuleBlueprint } from '@autodidact/types';
import type { Logger } from '@autodidact/observability';
import { QUEUES, JOB_NAMES } from '../queues/definitions.js';
import type { AgentClient } from '../services/agent.client.js';
import { indexModuleChunks } from '../rag/index-chunks.js';

export interface CourseGenerationDeps {
  agentClient: AgentClient;
  queueProvider: IQueueProvider;
  logger: Logger;
}

/**
 * Generates a course blueprint via the Agent service and commits it to the DB.
 * Invoked per-task by the HTTP layer (Cloud Tasks in production, the loopback
 * provider locally). A throw propagates to the route handler, which translates
 * it into a retry (5xx) or — on the final attempt — marks the course 'failed'.
 */
export async function processCourseGeneration(
  data: CourseGenerationJobData,
  { agentClient, queueProvider, logger }: CourseGenerationDeps,
): Promise<void> {
  const { courseId, userId, topic, difficulty, moduleCount } = data;
  const db = getDb();
  logger.info({ courseId, topic }, 'Starting course generation');

  await db
    .update(courses)
    .set({ status: 'generating', updatedAt: new Date() })
    .where(eq(courses.id, courseId));

  const blueprint = await agentClient.generateCourse({
    courseId,
    userId,
    topic,
    difficulty,
    moduleCount,
  });

  const insertedModules = await db.transaction(async (tx) => {
    // A retry can reach here with modules already committed (e.g. the previous
    // attempt failed on the follow-up enqueue, after this transaction). Delete
    // before insert so a re-run replaces rather than duplicates the module set.
    await tx.delete(modules).where(eq(modules.courseId, courseId));

    await tx
      .update(courses)
      .set({
        title: blueprint.title,
        description: blueprint.description,
        difficulty: blueprint.difficulty,
        estimatedHours: Math.ceil(blueprint.estimatedHours),
        status: 'ready',
        blueprint,
        updatedAt: new Date(),
      })
      .where(eq(courses.id, courseId));

    const moduleRows = blueprint.modules.map((m: ModuleBlueprint) => ({
      courseId,
      position: m.position,
      title: m.title,
      description: m.description,
      objectives: m.objectives,
      contentOutline: m.contentOutline,
      estimatedMinutes: m.estimatedMinutes,
    }));

    return tx
      .insert(modules)
      .values(moduleRows)
      .returning({
        id: modules.id,
        title: modules.title,
        description: modules.description,
        objectives: modules.objectives,
        contentOutline: modules.contentOutline,
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
