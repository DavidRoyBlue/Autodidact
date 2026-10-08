import { View } from 'react-native';
import { AppText } from '../typography/AppText';
import { Heading } from '../typography/Heading';
import { Button } from '../interactive/Button';
import { Icon, type IconName } from './Icon';

type EmptyStateProps = {
  title: string;
  message: string;
  icon: IconName;
  action?: { label: string; onPress: () => void };
};

export function EmptyState({ title, message, icon, action }: EmptyStateProps) {
  return (
    <View className="items-center gap-3 px-6 py-10">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-primary/15">
        <Icon name={icon} color="primary" size={30} />
      </View>
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
