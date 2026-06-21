import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { cn } from '@/lib/utils';

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
  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      className={cn(
        'h-10 w-10 items-center justify-center rounded-full active:opacity-75',
        variant === 'primary' ? 'bg-primary' : 'border border-border bg-transparent',
        isDisabled && 'opacity-40',
      )}
    >
      {loading ? <ActivityIndicator size="small" className="text-primary-foreground" /> : icon}
    </Pressable>
  );
}
