import { View } from 'react-native';
import { cn } from '@/lib/utils';
import { AppText } from '../typography/AppText';

type ProgressBarProps = {
  value: number;
  label?: string;
  /** On a primary fill (the continue card) the bar is drawn in the label color. */
  onPrimary?: boolean;
};

export function ProgressBar({ value, label, onPrimary = false }: ProgressBarProps) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <View className="gap-1">
      <View className={cn('h-1.5 overflow-hidden rounded-full', onPrimary ? 'bg-primary-foreground/25' : 'bg-muted')}>
        <View className={cn('h-1.5 rounded-full', onPrimary ? 'bg-primary-foreground' : 'bg-primary')} style={{ width: `${pct}%` }} />
      </View>
      {label && <AppText variant="caption">{label}</AppText>}
    </View>
  );
}
