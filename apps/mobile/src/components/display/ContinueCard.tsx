import { Pressable, View } from 'react-native';
import type { Course } from '@/api/courses';
import { AppText } from '../typography/AppText';
import { Heading } from '../typography/Heading';
import { Icon } from './Icon';
import { ProgressBar } from './ProgressBar';

/** The home hero: one tap back into the next module of the course in progress. */
export function ContinueCard({ course, onPress }: { course: Course; onPress: () => void }) {
  const fresh = course.completedModules === 0;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="gap-3 rounded-lg bg-primary p-5 active:opacity-90">
      <AppText variant="label" className="text-primary-foreground/80">{fresh ? 'Start learning' : 'Continue learning'}</AppText>
      <Heading size="h3" className="text-primary-foreground" numberOfLines={2}>{course.title}</Heading>
      <AppText className="text-primary-foreground/90" numberOfLines={2}>
        Module {(course.nextModulePosition ?? 0) + 1} of {course.totalModules}: {course.nextModuleTitle}
      </AppText>
      <ProgressBar value={course.totalModules ? course.completedModules / course.totalModules : 0} onPrimary />
      <View className="flex-row items-center justify-end gap-1">
        <AppText weight="semibold" className="text-primary-foreground">{fresh ? 'Start lesson' : 'Resume lesson'}</AppText>
        <Icon name="arrow-forward" color="primaryForeground" size={18} />
      </View>
    </Pressable>
  );
}
