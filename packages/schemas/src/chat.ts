import { z } from 'zod';

export const SendMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});

export const CreateChatSessionSchema = z.object({
  moduleId: z.string().uuid(),
});

/** What the platform's course-teacher agent returns for one learner turn. */
export const TeacherReplySchema = z.object({
  reply: z.string().min(1),
  module_complete: z.boolean(),
  score: z.number().int().min(0).max(100).nullable(),
});

export type TeacherReply = z.infer<typeof TeacherReplySchema>;
export type SendMessage = z.infer<typeof SendMessageSchema>;
export type CreateChatSession = z.infer<typeof CreateChatSessionSchema>;
