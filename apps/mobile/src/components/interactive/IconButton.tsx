import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { cn } from '@/lib/utils';
import { useThemeColors } from '@/lib/theme-colors';

type IconButtonProps = {
  icon: ReactNode;
  variant?: 'primary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
};

export function IconButton({
  icon,
  variant = 'primary',
  loading = false,
  disabled = false,
  onPress,
}: IconButtonProps) {
  const isDisabled = disabled || loading;
  const c = useThemeColors();
  const indicatorColor = variant === 'primary' ? c.primaryForeground : c.foreground;
  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      className={cn(
        'h-11 w-11 items-center justify-center rounded-full active:opacity-75',
        variant === 'primary' ? 'bg-primary' : 'border border-border bg-transparent',
        isDisabled && 'opacity-40',
      )}
    >
      {loading ? <ActivityIndicator size="small" color={indicatorColor} /> : icon}
    </Pressable>
  );
}
