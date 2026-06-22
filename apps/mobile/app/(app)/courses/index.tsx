import { FlatList, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme, XStack, YStack } from 'tamagui';
import { useUserCourses, type Course } from '@/api/courses';
import { Screen, Card, AppText, Badge, EmptyState, SkeletonCard } from '@/components';

export default function MyCoursesScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { data: courses, isLoading, isRefetching, refetch } = useUserCourses();

  if (isLoading) {
    return (
      <Screen>
        <YStack gap="$3" paddingVertical="$1">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </YStack>
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
            tintColor={theme.primary.get()}
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
            <XStack justifyContent="space-between" alignItems="flex-start" marginBottom="$2">
              <YStack flex={1} marginRight="$2">
                <AppText variant="body" weight="semibold" size="lg">
                  {item.title}
                </AppText>
              </YStack>
              <Badge label={item.difficulty} />
            </XStack>
            <AppText variant="muted" size="sm" numberOfLines={2}>{item.description}</AppText>
            {item.completedAt && (
              <YStack marginTop="$2">
                <AppText variant="body" color="$success" size="sm">✓ Completed</AppText>
              </YStack>
            )}
          </Card>
        )}
      />
    </Screen>
  );
}
