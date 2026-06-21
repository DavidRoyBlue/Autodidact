import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button as UIButton } from '@/components/ui/button';
import { AppText } from '../typography/AppText';

type ButtonProps = {
  variant?: 'primary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  children: ReactNode;
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  onPress,
  children,
}: ButtonProps) {
  const textClass = variant === 'ghost' ? 'text-foreground' : 'text-primary-foreground';
  return (
    <UIButton
      variant={variant}
      size={size}
      disabled={disabled || loading}
      onPress={disabled || loading ? undefined : onPress}
    >
      {loading ? (
        <View className="flex-row items-center gap-2">
          <ActivityIndicator size="small" className={textClass} />
          <AppText weight="semibold" className={textClass}>{children}</AppText>
        </View>
      ) : (
        <AppText weight="semibold" className={textClass}>{children}</AppText>
      )}
    </UIButton>
  );
}
