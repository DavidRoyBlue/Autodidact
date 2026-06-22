import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { cn } from '@/lib/utils';

const variantClass = {
  default: 'bg-card border border-border',
  elevated: 'bg-muted',
  ghost: 'bg-transparent border border-border',
} as const;

type CardProps = {
  variant?: 'default' | 'elevated' | 'ghost';
  onPress?: () => void;
  disabled?: boolean;
  children: ReactNode;
};

export function Card({ variant = 'default', onPress, disabled = false, children }: CardProps) {
  const className = cn('rounded-md p-4', variantClass[variant], disabled && 'opacity-45');
  if (onPress) {
    return (
      <Pressable
        onPress={disabled ? undefined : onPress}
        disabled={disabled}
        className={cn(className, 'active:opacity-85')}
      >
        {children}
      </Pressable>
    );
  }
  return <View className={className}>{children}</View>;
}
