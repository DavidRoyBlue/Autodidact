import { View } from 'react-native';
import type { ModuleStatus } from '@autodidact/types';
import { cn } from '@/lib/utils';
import { AppText } from '../typography/AppText';
import { Icon } from './Icon';

/** A module's place in the course: its number while open, a check when done, a lock until unlocked. */
export function ModuleStatusBadge({ position, status }: { position: number; status: ModuleStatus }) {
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
