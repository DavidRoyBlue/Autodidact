import { Pressable, View } from 'react-native';
import type { Course } from '@/api/courses';
import { AppText } from '../typography/AppText';
import { Heading } from '../typography/Heading';
import { Icon } from './Icon';

/** The home hero: one tap back into the next module of the course in progress. */
export function ContinueCard({ course, onPress }: { course: Course; onPress: () => void }) {
  const pct = course.totalModules ? Math.round((course.completedModules / course.totalModules) * 100) : 0;
  return (
    <Pressable onPress={onPress} className="gap-3 rounded-lg bg-primary p-5 active:opacity-90">
      <AppText variant="label" className="text-primary-foreground/80">Continue learning</AppText>
      <Heading size="h3" className="text-primary-foreground" numberOfLines={2}>{course.title}</Heading>
      <AppText className="text-primary-foreground/90" numberOfLines={2}>
        Module {(course.nextModulePosition ?? 0) + 1} of {course.totalModules}: {course.nextModuleTitle}
      </AppText>
      <View className="h-1.5 overflow-hidden rounded-full bg-primary-foreground/25">
        <View className="h-1.5 rounded-full bg-primary-foreground" style={{ width: `${pct}%` }} />
      </View>
      <View className="flex-row items-center justify-end gap-1">
        <AppText weight="semibold" className="text-primary-foreground">Resume lesson</AppText>
        <Icon name="arrow-forward" color="primaryForeground" size={18} />
      </View>
    </Pressable>
  );
}
