import { FlatList, RefreshControl, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCourse } from '@/api/courses';
import { useProgress } from '@/api/progress';
import { Screen, Heading, AppText, Card, ProgressBar, PositionBadge, SkeletonLine, SkeletonCard } from '@/components';
import type { ModuleBlueprint } from '@autodidact/types';

function LoadingSkeleton() {
  return (
    <View className="gap-3 py-1">
      <SkeletonLine className="w-[70%] h-8" />
      <SkeletonLine />
      <SkeletonLine className="h-1.5" />
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </View>
  );
}

export default function CourseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: course, isLoading, isRefetching: courseRefetching, refetch: refetchCourse } = useCourse(id);
  const { data: progress, isRefetching: progressRefetching, refetch: refetchProgress } = useProgress(id);

  const progressMap = new Map(progress?.map((p) => [p.moduleId, p]) ?? []);
  const completedCount = progress?.filter((p) => p.status === 'completed').length ?? 0;
  const totalCount = progress?.length ?? 0;
  const progressPct = totalCount > 0 ? completedCount / totalCount : 0;

  const handleRefresh = () => {
    void refetchCourse();
    void refetchProgress();
  };

  if (isLoading) {
    return (
      <Screen>
        <LoadingSkeleton />
      </Screen>
    );
  }

  if (!course) return null;

  return (
    <Screen>
      <FlatList
        data={(course.modules ?? []) as ModuleBlueprint[]}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
        refreshControl={
          <RefreshControl
            refreshing={courseRefetching || progressRefetching}
            onRefresh={handleRefresh}
            tintColor="#6366f1"
          />
        }
        ListHeaderComponent={
          <View className="gap-4 mb-4">
            <Heading size="h1">{course.title}</Heading>
            <AppText variant="muted">{course.description}</AppText>
            <ProgressBar value={progressPct} label={`${completedCount}/${totalCount} modules`} />
          </View>
        }
        renderItem={({ item }) => {
          const modProgress = progressMap.get(item.id);
          const status = modProgress?.status ?? 'locked';
          const isLocked = status === 'locked';
          const isCompleted = status === 'completed';

          return (
            <Card
              variant="default"
              onPress={isLocked ? undefined : () => router.push(`/(app)/courses/${id}/modules/${item.id}/chat`)}
              disabled={isLocked}
            >
              <View className="flex-row items-center gap-3 mb-2">
                <PositionBadge position={item.position + 1} completed={isCompleted} />
                <View className="flex-1">
                  <AppText variant="body" weight="semibold">{item.title}</AppText>
                  <AppText variant="caption">{status.replace('_', ' ')}</AppText>
                </View>
                {!isLocked && <AppText variant="muted" size="xl">›</AppText>}
              </View>
              <AppText variant="muted" size="sm" numberOfLines={2}>{item.description}</AppText>
            </Card>
          );
        }}
      />
    </Screen>
  );
}
