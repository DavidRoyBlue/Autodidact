import { View } from 'react-native';
import { cn } from '@/lib/utils';
import { AppText } from '../typography/AppText';

type PositionBadgeProps = {
  position: number;
  completed: boolean;
};

export function PositionBadge({ position, completed }: PositionBadgeProps) {
  return (
    <View className={cn('h-8 w-8 items-center justify-center rounded-full', completed ? 'bg-success' : 'bg-muted')}>
      <AppText variant="body" weight="bold" size="sm">
        {completed ? '✓' : String(position)}
      </AppText>
    </View>
  );
}
