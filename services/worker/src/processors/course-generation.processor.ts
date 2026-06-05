import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { eq, getDb, courses, modules } from '@autodidact/db';
import type { IQueueProvider } from '@autodidact/providers';
import type { CourseGenerationJobData, ModuleBlueprint } from '@autodidact/types';
import type { Logger } from '@autodidact/observability';
import { QUEUES, JOB_NAMES } from '../queues/definitions.js';
import type { AgentClient } from '../services/agent.client.js';
import { indexModuleChunks } from '../rag/index-chunks.js';

export function createCourseGenerationWorker(
  connection: Redis,
  agentClient: AgentClient,
  queueProvider: IQueueProvider,
  logger: Logger,
): Worker {
  return new Worker<CourseGenerationJobData>(
    QUEUES.COURSE_GENERATION,
    async (job) => {
      const { courseId, userId, topic, difficulty, moduleCount } = job.data;
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
      // failure here never rolls back the course or triggers a full job retry.
      try {
        await indexModuleChunks(insertedModules, agentClient, logger);
      } catch (err) {
        logger.error({ err, courseId }, 'module content RAG indexing failed (non-fatal)');
      }

      await queueProvider.enqueue(
        QUEUES.EMBEDDING,
        JOB_NAMES.GENERATE_EMBEDDING,
        { courseId, topic },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );

      logger.info({ courseId }, 'Course generation complete');
    },
    { connection, concurrency: 3 },
  );
}
