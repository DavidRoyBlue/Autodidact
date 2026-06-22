import { Pressable } from 'react-native';
import { cn } from '@/lib/utils';
import { AppText } from '../typography/AppText';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
};

export function Chip({ label, selected = false, onPress }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'flex-1 flex-row items-center justify-center rounded-sm border px-3 py-2 active:opacity-80',
        selected ? 'border-primary bg-primary/[0.13]' : 'border-border bg-card',
      )}
    >
      <AppText
        variant={selected ? 'body' : 'muted'}
        weight={selected ? 'semibold' : 'regular'}
        className={selected ? 'text-primary' : 'text-muted-foreground'}
      >
        {label}
      </AppText>
    </Pressable>
  );
}
