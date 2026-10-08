import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useRetryCourse, useUserCourses, type Course } from '@/api/courses';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useToastStore } from '@/stores/toast.store';
import { Screen, Heading, AppText, ContinueCard, CourseCard, EmptyState, SkeletonCard } from '@/components';

export default function HomeScreen() {
  const router = useRouter();
  const { data: courses, isLoading, isError, isRefetching, refetch } = useUserCourses();
  useRefreshOnFocus(refetch);
  const retry = useRetryCourse();
  const toast = useToastStore((s) => s.addToast);
  const retryCourse = (id: string) =>
    retry.mutate(id, { onError: () => toast("Couldn't retry the course. Try again in a moment.", 'error') });

  // The list is most-recently-opened first: the first open course is the one to resume.
  const current = courses?.find((c) => c.status === 'ready' && !c.completedAt && c.nextModuleId);
  const openLesson = (c: Course) => router.push(`/(app)/courses/${c.id}/modules/${c.nextModuleId}/chat`);
  const create = () => router.navigate('/(app)/(tabs)/create');

  return (
    <Screen scroll onRefresh={refetch} refreshing={isRefetching}>
      <View className="gap-6 pt-2">
        <View className="gap-1">
          <Heading>Your learning</Heading>
          <AppText variant="muted">
            {current?.completedModules ? 'Pick up where you left off.' : 'Every course is a conversation with your teacher.'}
          </AppText>
        </View>

        {isLoading ? (
          <View className="gap-3">
            <SkeletonCard className="h-44" />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : isError ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Can't reach Autodidact"
            message="Check your connection, then try again."
            action={{ label: 'Try again', onPress: () => void refetch() }}
          />
        ) : !courses?.length ? (
          <EmptyState
            icon="sparkles-outline"
            title="Learn anything"
            message="Name a topic. Autodidact builds a course and teaches it to you, one module at a time."
            action={{ label: 'Create your first course', onPress: create }}
          />
        ) : (
          <>
            {current && <ContinueCard course={current} onPress={() => openLesson(current)} />}
            <View className="gap-3">
              <AppText variant="label">All courses</AppText>
              {courses.map((c) => (
                <CourseCard
                  key={c.id}
                  course={c}
                  onPress={() => router.push(`/(app)/courses/${c.id}`)}
                  onRetry={() => retryCourse(c.id)}
                  retrying={retry.isPending && retry.variables === c.id}
                />
              ))}
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}
