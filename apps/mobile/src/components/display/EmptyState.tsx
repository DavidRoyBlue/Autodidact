import { View } from 'react-native';
import { AppText } from '../typography/AppText';
import { Heading } from '../typography/Heading';
import { Button } from '../interactive/Button';
import { IconTile } from './IconTile';
import type { IconName } from './Icon';

type EmptyStateProps = {
  title: string;
  message: string;
  icon: IconName;
  action?: { label: string; onPress: () => void };
};

export function EmptyState({ title, message, icon, action }: EmptyStateProps) {
  return (
    <View className="items-center gap-3 px-6 py-10">
      <IconTile icon={icon} />
      <Heading size="h3" className="text-center">{title}</Heading>
      <AppText variant="muted" className="text-center">{message}</AppText>
      {action && (
        <View className="mt-2 self-stretch">
          <Button size="lg" onPress={action.onPress}>{action.label}</Button>
        </View>
      )}
    </View>
  );
}
