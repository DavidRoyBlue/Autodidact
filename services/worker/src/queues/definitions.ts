export const QUEUES = {
  COURSE_GENERATION: 'course-generation',
  EMBEDDING: 'embedding',
} as const;

export const JOB_NAMES = {
  GENERATE_COURSE: 'generate-course',
  GENERATE_EMBEDDING: 'generate-embedding',
  CLEANUP_STALE_ANONYMOUS: 'cleanup-stale-anonymous',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];
