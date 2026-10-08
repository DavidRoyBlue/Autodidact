import { Injectable } from '@nestjs/common';

import { getDb, modules, moduleProgress, enrollments, eq, and, sql } from '@autodidact/db';

@Injectable()
export class ProgressService {
  async getUserProgress(userId: string, courseId: string) {
    const db = getDb();
    return db
      .select({
        moduleId: moduleProgress.moduleId,
        moduleTitle: modules.title,
        position: modules.position,
        status: moduleProgress.status,
        completionScore: moduleProgress.completionScore,
        startedAt: moduleProgress.startedAt,
        completedAt: moduleProgress.completedAt,
      })
      .from(moduleProgress)
      .innerJoin(modules, eq(moduleProgress.moduleId, modules.id))
      .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.courseId, courseId)))
      .orderBy(modules.position);
  }

  async completeModule(userId: string, moduleId: string, courseId: string, score: number) {
    const db = getDb();

    await db
      .update(moduleProgress)
      .set({ status: 'completed', completedAt: new Date(), completionScore: score })
      .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.moduleId, moduleId)));

    // Unlock the next module in sequence
    await db.execute(sql`
      UPDATE module_progress mp
      SET status = 'available'
      FROM modules m
      WHERE mp.module_id = m.id
        AND mp.user_id = ${userId}
        AND mp.course_id = ${courseId}
        AND mp.status = 'locked'
        AND m.position = (
          SELECT position + 1
          FROM modules
          WHERE id = ${moduleId}
        )
    `);

    // Check if enrollment is fully complete
    const allProgress = await db
      .select({ status: moduleProgress.status })
      .from(moduleProgress)
      .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.courseId, courseId)));

    if (allProgress.length > 0 && allProgress.every((p) => p.status === 'completed')) {
      await db
        .update(enrollments)
        .set({ completedAt: new Date() })
        .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)));
    }
  }

  /** The learner opened a module: it is in progress, and its course is their most recent. */
  async markModuleStarted(userId: string, moduleId: string, courseId: string) {
    const db = getDb();
    await db
      .update(moduleProgress)
      .set({ status: 'in_progress', startedAt: new Date() })
      .where(
        and(
          eq(moduleProgress.userId, userId),
          eq(moduleProgress.moduleId, moduleId),
          eq(moduleProgress.status, 'available'),
        ),
      );
    await db
      .update(enrollments)
      .set({ lastAccessedAt: new Date() })
      .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)));
  }
}
