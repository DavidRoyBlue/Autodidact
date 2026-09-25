import { z } from 'zod';

export const DifficultyLevelSchema = z.enum(['beginner', 'intermediate', 'advanced']);
export const TimeBudgetSchema = z.enum(['30min', '1h', '4h', 'unrestricted']);

export const CreateCourseRequestSchema = z.object({
  topic: z.string().min(3).max(200),
  difficulty: DifficultyLevelSchema.optional().default('beginner'),
  timeBudget: TimeBudgetSchema.optional().default('1h'),
});

/**
 * What AgentPlatform's course-creator workflow returns (its
 * docs/architecture/course-creator.md §5), reduced to what the app persists;
 * the platform validates the whole document, so unknown keys are dropped here.
 */
export const GeneratedModuleSchema = z.object({
  position: z.number().int().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  objectives: z.array(z.string()),
  content: z.string().min(1),
  estimated_minutes: z.number().int().positive(),
  resources: z.array(z.object({ url: z.string(), title: z.string(), why: z.string() })),
});

export const GeneratedCourseSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  difficulty: DifficultyLevelSchema,
  budget: z.object({ estimated_minutes: z.number().int().positive() }),
  modules: z.array(GeneratedModuleSchema).min(1),
});

export type CreateCourseRequest = z.infer<typeof CreateCourseRequestSchema>;
export type GeneratedCourse = z.infer<typeof GeneratedCourseSchema>;
