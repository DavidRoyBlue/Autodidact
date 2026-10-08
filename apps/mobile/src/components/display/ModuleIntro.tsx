import { Linking, Pressable, View } from 'react-native';
import type { CourseModule } from '@autodidact/types';
import { AppText } from '../typography/AppText';
import { Heading } from '../typography/Heading';
import { Icon } from './Icon';

/** The top of a lesson: what the module covers, what you will learn, where to read further. */
export function ModuleIntro({ module }: { module: CourseModule }) {
  return (
    <View className="mb-2 gap-2 rounded-lg border border-border bg-card p-4">
      <Heading size="h3">{module.title}</Heading>
      <AppText variant="muted">{module.description}</AppText>
      {module.objectives.length > 0 && (
        <View className="mt-1 gap-1.5">
          <AppText variant="label">You will learn to</AppText>
          {module.objectives.map((o) => (
            <View key={o} className="flex-row gap-2">
              <Icon name="checkmark-circle-outline" color="primary" size={18} />
              <AppText size="sm" className="flex-1">{o}</AppText>
            </View>
          ))}
        </View>
      )}
      {module.resources.length > 0 && (
        <View className="mt-2 gap-2">
          <AppText variant="label">Further reading</AppText>
          {module.resources.map((r) => (
            <Pressable key={r.url} accessibilityRole="link" onPress={() => void Linking.openURL(r.url)} className="flex-row gap-2 active:opacity-70">
              <Icon name="open-outline" color="primary" size={18} />
              <View className="flex-1">
                <AppText size="sm" weight="semibold" className="text-primary">{r.title}</AppText>
                <AppText variant="caption">{r.why}</AppText>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
