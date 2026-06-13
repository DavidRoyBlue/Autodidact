import { z } from 'zod';
import { DifficultyLevelSchema } from './course.js';

/**
 * Background task payloads. Validated at the worker's HTTP boundary —
 * tasks arrive as POST bodies from Cloud Tasks (prod) or the loopback
 * queue provider (dev). Shapes mirror `@autodidact/types` jobs.ts.
 */

export const CourseGenerationJobSchema = z.object({
  courseId: z.string().min(1),
  userId: z.string().min(1),
  topic: z.string().min(1),
  difficulty: DifficultyLevelSchema,
  moduleCount: z.number().int().positive(),
});

export const EmbeddingJobSchema = z.object({
  courseId: z.string().min(1),
  topic: z.string().min(1),
});

export type CourseGenerationJobInput = z.infer<typeof CourseGenerationJobSchema>;
export type EmbeddingJobInput = z.infer<typeof EmbeddingJobSchema>;
