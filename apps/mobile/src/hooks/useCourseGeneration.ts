import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useGenerationStatus } from '../api/courses';

export function useCourseGeneration(courseId: string | null) {
  const router = useRouter();
  const { data } = useGenerationStatus(courseId);

  useEffect(() => {
    if (data?.status === 'completed' && courseId) {
      router.replace(`/(app)/courses/${courseId}`);
    }
  }, [data?.status, courseId, router]);

  return {
    isGenerating: data?.status === 'pending' || data?.status === 'active',
    failed: data?.status === 'failed',
    status: data?.status ?? null,
  };
}
