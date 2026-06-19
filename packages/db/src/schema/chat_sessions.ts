import { pgTable, uuid, text, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { modules } from './modules.js';
import type { ChatMessage } from '@autodidact/types';

export const chatSessions = pgTable('chat_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  moduleId: uuid('module_id')
    .notNull()
    .references(() => modules.id),
  messages: jsonb('messages').notNull().default('[]').$type<ChatMessage[]>(),
  threadId: text('thread_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
