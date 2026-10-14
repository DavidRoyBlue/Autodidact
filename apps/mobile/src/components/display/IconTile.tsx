import { View } from 'react-native';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from './Icon';

/** An icon on a tile: tinted for a state or a person, solid for the brand mark. */
export function IconTile({ icon, solid = false }: { icon: IconName; solid?: boolean }) {
  return (
    <View className={cn('h-16 w-16 items-center justify-center', solid ? 'rounded-lg bg-primary' : 'rounded-full bg-primary/15')}>
      <Icon name={icon} color={solid ? 'primaryForeground' : 'primary'} size={30} />
    </View>
  );
}
