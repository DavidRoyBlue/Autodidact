import { Injectable, NotFoundException } from '@nestjs/common';

import { getDb, courses, modules, enrollments, moduleProgress, eq, sql } from '@autodidact/db';
import type { IQueueProvider } from '@autodidact/providers';
import type { CreateCourseRequest } from '@autodidact/schemas';
import type { JobStatus } from '@autodidact/types';
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
        status: 'pending',
        generatedBy: userId,
      })
      .returning({ id: courses.id });

    if (!course) throw new Error('Failed to create course');

    // Retry/backoff is owned by the Cloud Tasks queue config (infra/modules/cloud-tasks).
    await this.queueProvider.enqueue(QUEUES.COURSE_GENERATION, JOB_NAMES.GENERATE_COURSE, {
      courseId: course.id,
      userId,
      topic: dto.topic,
      difficulty: dto.difficulty,
      moduleCount: dto.moduleCount,
    });

    return { courseId: course.id, status: 'pending', reused: false };
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

  async getUserCourses(userId: string) {
    const db = getDb();
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
      })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .where(eq(enrollments.userId, userId))
      .orderBy(enrollments.lastAccessedAt);
  }

  /**
   * Generation status, read from the DB — `courses.status` is the source of
   * truth (the Worker writes 'generating'/'ready'/'failed'). Mapped to the
   * job-status vocabulary the mobile client polls on.
   */
  async getGenerationStatus(courseId: string) {
    const course = await this.getCourse(courseId);
    const map: Record<string, JobStatus> = {
      pending: 'pending',
      generating: 'active',
      ready: 'completed',
      failed: 'failed',
    };
    return { courseId, status: map[course.status] ?? 'pending' };
  }
}
