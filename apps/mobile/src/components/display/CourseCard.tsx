import { ActivityIndicator, View } from 'react-native';
import { isBuilding, useRetryCourse, type Course } from '@/api/courses';
import { useThemeColors } from '@/lib/theme-colors';
import { useToastStore } from '@/stores/toast.store';
import { AppText } from '../typography/AppText';
import { Button } from '../interactive/Button';
import { Badge } from './Badge';
import { Card } from './Card';
import { ProgressBar } from './ProgressBar';

/** A course on the learner's list: building, failed, in progress or done. */
export function CourseCard({ course, onPress }: { course: Course; onPress: () => void }) {
  const { primary } = useThemeColors();
  const retry = useRetryCourse();
  const building = isBuilding(course);
  const ready = course.status === 'ready';
  return (
    <Card onPress={ready ? onPress : undefined}>
      <View className="flex-row items-start gap-3">
        <AppText weight="semibold" size="lg" className="flex-1" numberOfLines={2}>
          {course.title}
        </AppText>
        {course.completedAt ? <Badge label="Done" variant="success" /> : <Badge label={course.difficulty} />}
      </View>
      {building ? (
        <View className="mt-3 flex-row items-center gap-2">
          <ActivityIndicator size="small" color={primary} />
          <AppText variant="muted" size="sm" className="flex-1">
            Building your course. It takes about 5 minutes, and you can leave the app meanwhile.
          </AppText>
        </View>
      ) : course.status === 'failed' ? (
        <View className="mt-2 gap-3">
          <AppText variant="error">We couldn't build this course.</AppText>
          <Button
            variant="secondary"
            icon="refresh"
            loading={retry.isPending}
            onPress={() =>
              retry.mutate(course.id, {
                onError: () => useToastStore.getState().addToast("Couldn't retry the course. Try again in a moment.", 'error'),
              })
            }
          >
            Try again
          </Button>
        </View>
      ) : (
        <>
          {!!course.description && (
            <AppText variant="muted" size="sm" className="mt-1" numberOfLines={2}>
              {course.description}
            </AppText>
          )}
          <View className="mt-3">
            <ProgressBar
              value={course.totalModules ? course.completedModules / course.totalModules : 0}
              label={`${course.completedModules} of ${course.totalModules} modules`}
            />
          </View>
        </>
      )}
    </Card>
  );
}
