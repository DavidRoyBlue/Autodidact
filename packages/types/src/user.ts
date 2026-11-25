import type { ModuleStatus } from './course.js';

export interface AuthUser {
  id: string;
  supabaseId: string;
  email: string;
  role?: string;
}

export interface ModuleProgressItem {
  moduleId: string;
  status: ModuleStatus;
  startedAt: string | null;
  completedAt: string | null;
  completionScore: number | null;
}

export interface UserProgress {
  courseId: string;
  enrolledAt: string;
  completedAt: string | null;
  modules: ModuleProgressItem[];
}
