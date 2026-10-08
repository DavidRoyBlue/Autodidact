import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCourse } from '@/api/courses';
import { useProgress } from '@/api/progress';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useThemeColors } from '@/lib/theme-colors';
import {
  Screen, Heading, AppText, Badge, Button, Icon, ProgressBar, ModuleRow, EmptyState, SkeletonLine, SkeletonCard,
} from '@/components';

export default function CourseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { primary } = useThemeColors();
  const course = useCourse(id);
  const progress = useProgress(id);
  const [expanded, setExpanded] = useState(false);

  const refresh = () => {
    void course.refetch();
    void progress.refetch();
  };
  useRefreshOnFocus(refresh);

  if (course.isLoading) {
    return (
      <Screen edges={['bottom']}>
        <View className="gap-3">
          <SkeletonLine className="h-8 w-[70%]" />
          <SkeletonLine />
          <SkeletonCard className="h-28" />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </Screen>
    );
  }
  if (!course.data) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn't load this course"
          message="Check your connection, then try again."
          action={{ label: 'Try again', onPress: refresh }}
        />
      </Screen>
    );
  }

  const { title, description, difficulty, estimatedHours, modules } = course.data;
  const statusOf = (moduleId: string) => progress.data?.find((p) => p.moduleId === moduleId)?.status ?? 'locked';
  const completed = modules.filter((m) => statusOf(m.id) === 'completed').length;
  const next = modules.find((m) => ['available', 'in_progress'].includes(statusOf(m.id)));
  const openLesson = (moduleId: string) => router.push(`/(app)/courses/${id}/modules/${moduleId}/chat`);

  return (
    <Screen edges={['bottom']} padding={false}>
      <FlatList
        data={modules}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ gap: 10, padding: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={course.isRefetching || progress.isRefetching}
            onRefresh={refresh}
            tintColor={primary}
            colors={[primary]}
          />
        }
        ListHeaderComponent={
          <View className="mb-2 gap-4">
            <Heading size="h2">{title}</Heading>
            <View className="flex-row flex-wrap items-center gap-2">
              <Badge label={difficulty} />
              <AppText variant="caption">
                {modules.length} modules{estimatedHours ? ` · about ${estimatedHours} h` : ''}
              </AppText>
            </View>
            {!!description && (
              <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)}>
                <AppText variant="muted" numberOfLines={expanded ? undefined : 4}>{description}</AppText>
                {description.length > 200 && (
                  <AppText variant="caption" className="mt-1 text-primary">{expanded ? 'Show less' : 'Show more'}</AppText>
                )}
              </Pressable>
            )}
            <ProgressBar
              value={modules.length ? completed / modules.length : 0}
              label={`${completed} of ${modules.length} modules complete`}
            />
            {next ? (
              <Button size="lg" icon="play" onPress={() => openLesson(next.id)}>
                {completed === 0 && statusOf(next.id) === 'available'
                  ? 'Start the course'
                  : `Continue with module ${next.position + 1}`}
              </Button>
            ) : (
              completed === modules.length &&
              modules.length > 0 && (
                <View className="flex-row items-center gap-3 rounded-lg bg-success/15 p-4">
                  <Icon name="trophy" color="success" />
                  <AppText weight="semibold" className="flex-1 text-success">
                    Course complete. Revisit any module below.
                  </AppText>
                </View>
              )
            )}
            <AppText variant="label" className="mt-2">Modules</AppText>
          </View>
        }
        renderItem={({ item }) => (
          <ModuleRow
            position={item.position + 1}
            title={item.title}
            description={item.description}
            status={statusOf(item.id)}
            onPress={() => openLesson(item.id)}
          />
        )}
      />
    </Screen>
  );
}
