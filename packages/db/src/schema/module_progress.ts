import { pgTable, uuid, timestamp, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { modules } from './modules.js';
import { courses } from './courses.js';
import { moduleStatusEnum } from './enums.js';

export const moduleProgress = pgTable(
  'module_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    moduleId: uuid('module_id')
      .notNull()
      .references(() => modules.id),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id),
    status: moduleStatusEnum('status').notNull().default('locked'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    chatSessionId: uuid('chat_session_id'),
    completionScore: integer('completion_score'),
  },
  (t) => [uniqueIndex('module_progress_user_module_idx').on(t.userId, t.moduleId)],
);
