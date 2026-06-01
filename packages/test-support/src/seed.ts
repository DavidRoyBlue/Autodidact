import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { users, courses, modules, enrollments, moduleProgress } from '@autodidact/db';

export interface SeededUser {
  id: string;
}
export interface SeededCourse {
  id: string;
}
export interface SeededModule {
  id: string;
  position: number;
}
export interface SeededEnrollment {
  id: string;
}

export async function seedUser(db: NodePgDatabase): Promise<SeededUser> {
  const [user] = await db
    .insert(users)
    .values({ supabaseId: crypto.randomUUID(), email: `user-${crypto.randomUUID()}@test.com` })
    .returning({ id: users.id });
  if (!user) throw new Error('seedUser: insert returned no row');
  return user;
}

export async function seedCourse(db: NodePgDatabase, generatedBy: string): Promise<SeededCourse> {
  const [course] = await db
    .insert(courses)
    .values({
      topic: 'Python',
      slug: `python-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Python Basics',
      description: 'Learn Python',
      difficulty: 'beginner',
      status: 'ready',
      generatedBy,
    })
    .returning({ id: courses.id });
  if (!course) throw new Error('seedCourse: insert returned no row');
  return course;
}

export async function seedModules(
  db: NodePgDatabase,
  courseId: string,
  count: number,
): Promise<SeededModule[]> {
  const rows = Array.from({ length: count }, (_, i) => ({
    courseId,
    position: i,
    title: `Module ${i}`,
    description: `Description ${i}`,
    objectives: ['obj1'],
    contentOutline: [{ title: 'Section', points: ['point'] }],
    estimatedMinutes: 30,
  }));
  return db.insert(modules).values(rows).returning({ id: modules.id, position: modules.position });
}

export async function seedEnrollment(
  db: NodePgDatabase,
  userId: string,
  courseId: string,
): Promise<SeededEnrollment> {
  const [enrollment] = await db
    .insert(enrollments)
    .values({ userId, courseId })
    .returning({ id: enrollments.id });
  if (!enrollment) throw new Error('seedEnrollment: insert returned no row');
  return enrollment;
}

export async function seedModuleProgress(
  db: NodePgDatabase,
  userId: string,
  courseId: string,
  mods: SeededModule[],
) {
  const rows = mods.map((m) => ({
    userId,
    moduleId: m.id,
    courseId,
    status: (m.position === 0 ? 'available' : 'locked') as 'available' | 'locked',
  }));
  return db.insert(moduleProgress).values(rows).returning();
}
