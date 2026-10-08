import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { getDb, courses, modules, enrollments, moduleProgress, eq, desc, sql } from '@autodidact/db';
import type { IQueueProvider } from '@autodidact/providers';
import type { CreateCourseRequest } from '@autodidact/schemas';
import { ApiAgentClient } from '../../services/agent.client.js';
import { QUEUES, JOB_NAMES } from '../../queues/definitions.js';
import { ProvisioningService } from '../provisioning/provisioning.service.js';

@Injectable()
export class CoursesService {
  constructor(
    private readonly agentClient: ApiAgentClient,
    private readonly queueProvider: IQueueProvider,
    private readonly provisioning: ProvisioningService,
  ) {}

  async createOrReuse(userId: string, dto: CreateCourseRequest) {
    const db = getDb();

    // Generate embedding to find similar existing courses
    const embedding = await this.agentClient.generateEmbedding(dto.topic);
    const vectorLiteral = `[${embedding.join(',')}]`;

    // Cosine similarity search — threshold 0.92
    const existing = await db.execute(sql`
      SELECT id, title, description, status,
             1 - (topic_embedding <=> ${vectorLiteral}::vector) AS similarity
      FROM courses
      WHERE status = 'ready'
        AND is_public = TRUE
        AND difficulty = ${dto.difficulty}
        AND time_budget = ${dto.timeBudget}
        AND topic_embedding IS NOT NULL
        AND 1 - (topic_embedding <=> ${vectorLiteral}::vector) > 0.92
      ORDER BY similarity DESC
      LIMIT 1
    `);

    if (existing.rows.length > 0) {
      const row = existing.rows[0] as { id: string; title: string };
      await this.enrollUser(userId, row.id);
      return { courseId: row.id, status: 'ready', reused: true };
    }

    // Create new course and enqueue generation
    const slug = dto.topic
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const [course] = await db
      .insert(courses)
      .values({
        topic: dto.topic,
        slug,
        title: dto.topic,
        description: '',
        difficulty: dto.difficulty,
        timeBudget: dto.timeBudget,
        status: 'pending',
        generatedBy: userId,
      })
      .returning({ id: courses.id });

    if (!course) throw new Error('Failed to create course');

    // Enroll the creator now, so the course is on their list while it generates;
    // the Worker adds their module_progress rows when the modules land.
    await this.enrollUser(userId, course.id);

    // Retry/backoff is owned by the Cloud Tasks queue config (infra/modules/cloud-tasks).
    await this.queueProvider.enqueue(QUEUES.COURSE_GENERATION, JOB_NAMES.GENERATE_COURSE, {
      courseId: course.id,
      userId,
      topic: dto.topic,
      difficulty: dto.difficulty,
      timeBudget: dto.timeBudget,
    });

    return { courseId: course.id, status: 'pending', reused: false };
  }

  /** Re-queues a failed course's generation; only its creator may. */
  async retryGeneration(userId: string, courseId: string) {
    const course = await this.getCourse(courseId);
    if (course.generatedBy !== userId) throw new ForbiddenException('Only the creator can retry this course');
    if (course.status !== 'failed') return { courseId, status: course.status };
    await getDb().update(courses).set({ status: 'pending', updatedAt: new Date() }).where(eq(courses.id, courseId));
    await this.queueProvider.enqueue(QUEUES.COURSE_GENERATION, JOB_NAMES.GENERATE_COURSE, {
      courseId,
      userId,
      topic: course.topic,
      difficulty: course.difficulty,
      timeBudget: course.timeBudget,
    });
    return { courseId, status: 'pending' };
  }

  async enrollUser(userId: string, courseId: string) {
    await this.provisioning.ensureProvisioned(userId);
    const db = getDb();

    // Upsert enrollment
    await db
      .insert(enrollments)
      .values({ userId, courseId })
      .onConflictDoUpdate({
        target: [enrollments.userId, enrollments.courseId],
        set: { lastAccessedAt: new Date() },
      });

    // Create module_progress rows for all modules if not present
    const courseModules = await db
      .select({ id: modules.id, position: modules.position })
      .from(modules)
      .where(eq(modules.courseId, courseId))
      .orderBy(modules.position);

    for (const mod of courseModules) {
      await db
        .insert(moduleProgress)
        .values({
          userId,
          moduleId: mod.id,
          courseId,
          status: mod.position === 0 ? 'available' : 'locked',
        })
        .onConflictDoNothing();
    }
  }

  async getCourse(courseId: string) {
    const db = getDb();
    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  async getCourseWithModules(courseId: string) {
    const db = getDb();
    const course = await this.getCourse(courseId);
    const courseModules = await db
      .select()
      .from(modules)
      .where(eq(modules.courseId, courseId))
      .orderBy(modules.position);
    return { ...course, modules: courseModules };
  }

  /** The learner's courses, most recently opened first, each with its progress and next module. */
  async getUserCourses(userId: string) {
    const db = getDb();
    const count = (filter = sql``) => sql<number>`(
      SELECT count(*)::int FROM module_progress mp
      WHERE mp.user_id = ${userId} AND mp.course_id = ${courses.id} ${filter})`;
    const next = (column: string) => sql<string | number | null>`(
      SELECT ${sql.raw(`m.${column}`)} FROM module_progress mp JOIN modules m ON m.id = mp.module_id
      WHERE mp.user_id = ${userId} AND mp.course_id = ${courses.id}
        AND mp.status IN ('available', 'in_progress')
      ORDER BY m.position LIMIT 1)`;
    return db
      .select({
        id: courses.id,
        title: courses.title,
        description: courses.description,
        difficulty: courses.difficulty,
        status: courses.status,
        isOnboarding: courses.isOnboarding,
        enrolledAt: enrollments.enrolledAt,
        completedAt: enrollments.completedAt,
        totalModules: count(),
        completedModules: count(sql`AND mp.status = 'completed'`),
        nextModuleId: next('id').mapWith(String),
        nextModuleTitle: next('title').mapWith(String),
        nextModulePosition: next('position').mapWith(Number),
      })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .where(eq(enrollments.userId, userId))
      .orderBy(desc(enrollments.lastAccessedAt));
  }
}
