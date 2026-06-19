import { pgTable, uuid, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { courses } from './courses.js';

export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id),
    enrolledAt: timestamp('enrolled_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    lastAccessedAt: timestamp('last_accessed_at').defaultNow(),
  },
  (t) => [uniqueIndex('enrollments_user_course_idx').on(t.userId, t.courseId)],
);
