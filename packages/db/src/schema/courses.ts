import { pgTable, uuid, text, timestamp, boolean, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { courseStatusEnum, difficultyEnum, timeBudgetEnum } from './enums.js';
import { users } from './users.js';
import { vector } from '../vector.js';

export const courses = pgTable(
  'courses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topic: text('topic').notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    difficulty: difficultyEnum('difficulty').notNull().default('beginner'),
    timeBudget: timeBudgetEnum('time_budget').notNull().default('1h'),
    estimatedHours: integer('estimated_hours'),
    status: courseStatusEnum('status').notNull().default('pending'),
    topicEmbedding: vector('topic_embedding', { dimensions: 1536 }),
    isPublic: boolean('is_public').notNull().default(true),
    isOnboarding: boolean('is_onboarding').notNull().default(false),
    generatedBy: uuid('generated_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('courses_is_onboarding_unique').on(t.isOnboarding).where(sql`${t.isOnboarding}`),
  ],
);
