import type { CourseModule, CourseStatus, DifficultyLevel, TimeBudget } from '@autodidact/types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import { useAuthStore } from '../stores/auth.store';

export type Course = {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  status: CourseStatus;
  isOnboarding: boolean;
  enrolledAt: string;
  completedAt: string | null;
  totalModules: number;
  completedModules: number;
  nextModuleId: string | null;
  nextModuleTitle: string | null;
  nextModulePosition: number | null;
};

export const isBuilding = (c: Course) => c.status === 'pending' || c.status === 'generating';

export function useUserCourses() {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['courses'],
    queryFn: async (): Promise<Course[]> => {
      const res = await apiFetch('/courses');
      if (!res.ok) throw new Error('Failed to fetch courses');
      return res.json() as Promise<Course[]>;
    },
    enabled: !!accessToken, // never fetch /courses on the auth screens (avoids a 401 that clears the session)
    // A course being generated is on the list; poll until it is ready or failed.
    refetchInterval: (query) => (query.state.data?.some(isBuilding) ? 5000 : false),
  });
}

export type CourseDetail = {
  id: string;
  title: string;
  description: string;
  difficulty: DifficultyLevel;
  estimatedHours: number | null;
  modules: CourseModule[];
};

export function useCourse(courseId: string) {
  return useQuery({
    queryKey: ['courses', courseId],
    queryFn: async () => {
      const res = await apiFetch(`/courses/${courseId}`);
      if (!res.ok) throw new Error('Failed to fetch course');
      return res.json() as Promise<CourseDetail>;
    },
    enabled: !!courseId,
  });
}

export function useCreateCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { topic: string; difficulty: DifficultyLevel; timeBudget: TimeBudget }) => {
      const res = await apiFetch('/courses', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create course');
      return res.json() as Promise<{ courseId: string; status: 'pending' | 'ready'; reused: boolean }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
  });
}
