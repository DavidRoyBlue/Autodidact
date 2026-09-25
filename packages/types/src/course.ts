export type CourseStatus = 'pending' | 'generating' | 'ready' | 'failed';
export type ModuleStatus = 'locked' | 'available' | 'in_progress' | 'completed';
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';
export type JobStatus = 'pending' | 'active' | 'completed' | 'failed' | 'delayed';
export type TimeBudget = '30min' | '1h' | '4h' | 'unrestricted';

export interface ModuleResource {
  url: string;
  title: string;
  why: string;
}

export interface CourseModule {
  id: string;
  position: number;
  title: string;
  description: string;
  objectives: string[];
  /** The full lesson, markdown. */
  content: string;
  resources: ModuleResource[];
  estimatedMinutes: number;
}
