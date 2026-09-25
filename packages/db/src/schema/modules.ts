import { pgTable, uuid, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { courses } from './courses.js';
import { moduleStatusEnum } from './enums.js';
import type { ModuleResource } from '@autodidact/types';

export const modules = pgTable('modules', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id')
    .notNull()
    .references(() => courses.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  objectives: jsonb('objectives').notNull().$type<string[]>(),
  // the full lesson, markdown, as the course-creator workflow wrote it
  content: text('content').notNull(),
  resources: jsonb('resources').notNull().default(sql`'[]'::jsonb`).$type<ModuleResource[]>(),
  estimatedMinutes: integer('estimated_minutes').notNull(),
  status: moduleStatusEnum('status').notNull().default('locked'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
