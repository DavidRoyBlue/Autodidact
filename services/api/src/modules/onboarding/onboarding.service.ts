import { Injectable } from '@nestjs/common';
import { getDb, users, courses, eq, sql } from '@autodidact/db';
import { createLogger } from '@autodidact/observability';
import { CoursesService } from '../courses/courses.service.js';

@Injectable()
export class OnboardingService {
  private readonly logger = createLogger('onboarding');
  private readonly onboarded = new Set<string>();

  constructor(private readonly coursesService: CoursesService) {}

  /**
   * Fire-once auto-enroll. On a user's first authenticated request, enroll them
   * into the shared onboarding course and stamp users.onboarded_at. Cheap on
   * every later request (in-process Set + onboarded_at short-circuit). A missing
   * onboarding course logs + skips (spec D5) and never throws to the caller.
   */
  async onboardOnce(userId: string): Promise<void> {
    if (this.onboarded.has(userId)) return;

    const db = getDb();
    const [user] = await db
      .select({ onboardedAt: users.onboardedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) return; // not provisioned yet — surfaced elsewhere; don't cache.
    if (user.onboardedAt) {
      this.onboarded.add(userId);
      return;
    }

    const [course] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.isOnboarding, true))
      .limit(1);

    if (!course) {
      this.logger.warn({ userId }, 'No onboarding course found — skipping auto-enroll');
      return; // do not cache: self-heals once the course is seeded.
    }

    await this.coursesService.enrollUser(userId, course.id);
    await db.update(users).set({ onboardedAt: sql`now()` }).where(eq(users.id, userId));
    this.onboarded.add(userId);
  }
}
