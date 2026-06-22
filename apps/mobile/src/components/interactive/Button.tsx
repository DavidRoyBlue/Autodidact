import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useColorScheme } from 'nativewind';
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
  const { colorScheme } = useColorScheme();
  const textClass = variant === 'ghost' ? 'text-foreground' : 'text-primary-foreground';
  const indicatorColor = variant === 'ghost' ? (colorScheme === 'dark' ? '#f1f5f9' : '#0f172a') : '#f1f5f9';
  return (
    <UIButton
      variant={variant}
      size={size}
      disabled={disabled || loading}
      onPress={disabled || loading ? undefined : onPress}
    >
      {loading ? (
        <View className="flex-row items-center gap-2">
          <ActivityIndicator size="small" color={indicatorColor} />
          <AppText weight="semibold" className={textClass}>{children}</AppText>
        </View>
      ) : (
        <AppText weight="semibold" className={textClass}>{children}</AppText>
      )}
    </UIButton>
  );
}
