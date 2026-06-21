import { View } from 'react-native';
import { AppText } from '../typography/AppText';

const frameClass = {
  default: 'bg-primary/[0.13]',
  success: 'bg-success/[0.15]',
  warning: 'bg-warning/[0.15]',
  danger: 'bg-destructive/[0.15]',
} as const;

const textClass = {
  default: 'text-primary-hover',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
} as const;

type BadgeProps = {
  label: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
};

export function Badge({ label, variant = 'default' }: BadgeProps) {
  return (
    <View className={`self-start rounded-sm px-2 py-0.5 ${frameClass[variant]}`}>
      <AppText variant="label" className={textClass[variant]}>
        {label}
      </AppText>
    </View>
  );
}
