import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import { useAuthStore } from '../stores/auth.store';

export type Course = {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  status: string;
  isOnboarding: boolean;
  enrolledAt: string;
  completedAt: string | null;
};

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
  });
}

export function useCourse(courseId: string) {
  return useQuery({
    queryKey: ['courses', courseId],
    queryFn: async () => {
      const res = await apiFetch(`/courses/${courseId}`);
      if (!res.ok) throw new Error('Failed to fetch course');
      return res.json();
    },
    enabled: !!courseId,
  });
}

export function useCreateCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { topic: string; difficulty?: string; preferredModuleCount?: number }) => {
      const res = await apiFetch('/courses', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create course');
      return res.json() as Promise<{ courseId: string; status: string; reused: boolean }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
  });
}

export function useGenerationStatus(courseId: string | null) {
  return useQuery({
    queryKey: ['generation', courseId],
    queryFn: async () => {
      const res = await apiFetch(`/courses/status/${courseId}`);
      if (!res.ok) throw new Error('Failed to fetch generation status');
      return res.json() as Promise<{ courseId: string; status: string }>;
    },
    enabled: !!courseId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'completed' || status === 'failed') return false;
      return 2000;
    },
  });
}

export function useEnrollCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (courseId: string) => {
      const res = await apiFetch(`/courses/${courseId}/enroll`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to enroll');
      return res.json();
    },
    onSuccess: (_data, courseId) => {
      void queryClient.invalidateQueries({ queryKey: ['courses', courseId] });
      void queryClient.invalidateQueries({ queryKey: ['progress', courseId] });
    },
  });
}
