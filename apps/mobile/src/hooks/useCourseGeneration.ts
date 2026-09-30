import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useEnrollCourse, useGenerationStatus } from '../api/courses';

export function useCourseGeneration(courseId: string | null) {
  const router = useRouter();
  const { data } = useGenerationStatus(courseId);
  const { mutateAsync: enroll } = useEnrollCourse();

  // The API enrolls the creator only when it reuses an existing course; a
  // freshly generated one has no enrollment or module_progress rows until
  // POST /courses/:id/enroll — without it the course opens 0/0, all locked.
  useEffect(() => {
    if (data?.status !== 'completed' || !courseId) return;
    void enroll(courseId).then(() => router.replace(`/(app)/courses/${courseId}`));
  }, [data?.status, courseId, router, enroll]);

  return {
    isGenerating: data?.status === 'pending' || data?.status === 'active',
    failed: data?.status === 'failed',
    status: data?.status ?? null,
  };
}
