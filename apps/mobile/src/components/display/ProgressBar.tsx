import { View } from 'react-native';
import { AppText } from '../typography/AppText';

type ProgressBarProps = {
  value: number;
  label?: string;
};

export function ProgressBar({ value, label }: ProgressBarProps) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <View className="gap-1">
      <View className="h-1.5 overflow-hidden rounded-full bg-muted">
        <View className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </View>
      {label && <AppText variant="caption">{label}</AppText>}
    </View>
  );
}
