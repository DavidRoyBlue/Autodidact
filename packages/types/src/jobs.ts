import type { DifficultyLevel } from './course.js';

export interface CourseGenerationJobData {
  courseId: string;
  userId: string;
  topic: string;
  difficulty: DifficultyLevel;
  moduleCount: number;
}

export interface EmbeddingJobData {
  courseId: string;
  topic: string;
}

export interface StaleAnonymousCleanupJobData {
  /** Delete anonymous users created more than this many days ago. Worker defaults to 90. */
  retentionDays?: number;
}
