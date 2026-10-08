import { View } from 'react-native';
import type { ModuleStatus } from '@autodidact/types';
import { AppText } from '../typography/AppText';
import { Card } from './Card';
import { Icon } from './Icon';
import { ModuleStatusBadge } from './ModuleStatusBadge';

const statusLabel: Record<ModuleStatus, string> = {
  locked: 'Locked',
  available: 'Ready to start',
  in_progress: 'In progress',
  completed: 'Completed',
};

type ModuleRowProps = {
  position: number;
  title: string;
  description: string;
  status: ModuleStatus;
  onPress: () => void;
};

export function ModuleRow({ position, title, description, status, onPress }: ModuleRowProps) {
  const locked = status === 'locked';
  return (
    <Card onPress={locked ? undefined : onPress} disabled={locked}>
      <View className="flex-row items-center gap-3">
        <ModuleStatusBadge position={position} status={status} />
        <View className="flex-1 gap-0.5">
          <AppText weight="semibold">{title}</AppText>
          <AppText variant="caption">{statusLabel[status]}</AppText>
        </View>
        {!locked && <Icon name="chevron-forward" color="mutedForeground" />}
      </View>
      <AppText variant="muted" size="sm" className="mt-2" numberOfLines={2}>{description}</AppText>
    </Card>
  );
}
