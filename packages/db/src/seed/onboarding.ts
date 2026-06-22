import { getDb, getPool, courses, modules, eq, type DB } from '../index.js';
import type { ContentSection } from '@autodidact/types';

const ONBOARDING_SLUG = 'welcome-to-autodidact';

interface PlaceholderModule {
  position: number;
  title: string;
  description: string;
  objectives: string[];
  contentOutline: ContentSection[];
  estimatedMinutes: number;
}

// Placeholder content only — the real curated content is a separate product task (spec D2).
const PLACEHOLDER_MODULES: PlaceholderModule[] = [
  {
    position: 0,
    title: 'Welcome to Autodidact',
    description: 'A quick tour of how learning works here.',
    objectives: ['Understand how Autodidact courses are structured'],
    contentOutline: [
      { title: 'How it works', points: ['Courses are made of modules', 'Each module is a guided chat lesson'] },
    ],
    estimatedMinutes: 5,
  },
  {
    position: 1,
    title: 'Generate your first course',
    description: 'Create a real AI-generated course on any topic you choose.',
    objectives: ['Generate your first course from a topic'],
    contentOutline: [
      { title: 'Try it', points: ['Pick a topic', 'Watch Autodidact build a course for you'] },
    ],
    estimatedMinutes: 5,
  },
];

/**
 * Upsert the single shared onboarding course + its modules. Idempotent and safe
 * to re-run (the partial unique index on `is_onboarding` guards duplicates).
 * Modules are upserted BY POSITION so their ids stay stable across runs —
 * module_progress.module_id has no ON DELETE cascade, so deleting modules would
 * orphan/block existing users' progress.
 */
export async function seedOnboardingCourse(db: DB = getDb()): Promise<{ courseId: string }> {
  const [existing] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.isOnboarding, true))
    .limit(1);

  let courseId: string;
  const courseFields = {
    topic: 'Welcome to Autodidact',
    slug: ONBOARDING_SLUG,
    title: 'Welcome to Autodidact',
    description: 'Your first course — learn how Autodidact works, then build your own.',
    difficulty: 'beginner' as const,
    status: 'ready' as const,
    isPublic: true,
  };

  if (existing) {
    courseId = existing.id;
    await db.update(courses).set({ ...courseFields, updatedAt: new Date() }).where(eq(courses.id, courseId));
  } else {
    const [inserted] = await db
      .insert(courses)
      .values({ ...courseFields, isOnboarding: true, generatedBy: null })
      .returning({ id: courses.id });
    if (!inserted) throw new Error('seedOnboardingCourse: course insert returned no row');
    courseId = inserted.id;
  }

  const existingModules = await db
    .select({ id: modules.id, position: modules.position })
    .from(modules)
    .where(eq(modules.courseId, courseId));
  const idByPosition = new Map(existingModules.map((m) => [m.position, m.id]));

  for (const m of PLACEHOLDER_MODULES) {
    const moduleId = idByPosition.get(m.position);
    if (moduleId) {
      await db
        .update(modules)
        .set({
          title: m.title,
          description: m.description,
          objectives: m.objectives,
          contentOutline: m.contentOutline,
          estimatedMinutes: m.estimatedMinutes,
        })
        .where(eq(modules.id, moduleId));
    } else {
      await db.insert(modules).values({
        courseId,
        position: m.position,
        title: m.title,
        description: m.description,
        objectives: m.objectives,
        contentOutline: m.contentOutline,
        estimatedMinutes: m.estimatedMinutes,
      });
    }
  }

  return { courseId };
}

// CLI entry: `tsx src/seed/onboarding.ts` (DATABASE_URL must be set in the env).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  seedOnboardingCourse()
    .then(({ courseId }) => {
      console.log(`✓ Onboarding course seeded: ${courseId}`);
      return getPool().end();
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('✗ Onboarding seed failed:', err);
      process.exit(1);
    });
}
