import { FlatList, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useUserCourses } from '@/api/courses';
import { Screen, Card, AppText, Badge, EmptyState, SkeletonCard } from '@/components';

type Course = {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  completedAt: string | null;
};

export default function MyCoursesScreen() {
  const router = useRouter();
  const { data: courses, isLoading, isRefetching, refetch } = useUserCourses();

  if (isLoading) {
    return (
      <Screen>
        <View className="gap-3 py-1">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={courses ?? []}
        keyExtractor={(item: Course) => item.id}
        contentContainerStyle={{ gap: 12, paddingVertical: 4 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#6366f1"
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="book-outline"
            message="No courses yet. Start learning something!"
            action={{ label: 'Start learning', onPress: () => router.push('/(app)') }}
          />
        }
        renderItem={({ item }: { item: Course }) => (
          <Card variant="default" onPress={() => router.push(`/(app)/courses/${item.id}`)}>
            <View className="flex-row justify-between items-start mb-2">
              <View className="flex-1 mr-2">
                <AppText variant="body" weight="semibold" size="lg">
                  {item.title}
                </AppText>
              </View>
              <Badge label={item.difficulty} />
            </View>
            <AppText variant="muted" size="sm" numberOfLines={2}>{item.description}</AppText>
            {item.completedAt && (
              <View className="mt-2">
                <AppText variant="body" className="text-success" size="sm">✓ Completed</AppText>
              </View>
            )}
          </Card>
        )}
      />
    </Screen>
  );
}
