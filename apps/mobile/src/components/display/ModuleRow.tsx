import { View } from 'react-native';
import type { ModuleStatus } from '@autodidact/types';
import { cn } from '@/lib/utils';
import { AppText } from '../typography/AppText';
import { Card } from './Card';
import { Icon } from './Icon';

/** A module's place in the course: its number while open, a check when done, a lock until unlocked. */
function ModuleStatusBadge({ position, status }: { position: number; status: ModuleStatus }) {
  const open = status === 'available' || status === 'in_progress';
  return (
    <View
      className={cn(
        'h-9 w-9 items-center justify-center rounded-full',
        status === 'completed' ? 'bg-success' : open ? 'bg-primary' : 'bg-muted',
      )}
    >
      {status === 'completed' ? (
        <Icon name="checkmark" color="primaryForeground" size={18} />
      ) : status === 'locked' ? (
        <Icon name="lock-closed" color="mutedForeground" size={15} />
      ) : (
        <AppText weight="bold" className="text-primary-foreground">{position}</AppText>
      )}
    </View>
  );
}

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
