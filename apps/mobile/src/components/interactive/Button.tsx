import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button as UIButton } from '@/components/ui/button';
import { AppText } from '../typography/AppText';
import { Icon, type IconName } from '../display/Icon';
import { useThemeColors, type ThemeColor } from '@/lib/theme-colors';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const content: Record<Variant, { text: string; color: ThemeColor }> = {
  primary: { text: 'text-primary-foreground', color: 'primaryForeground' },
  danger: { text: 'text-primary-foreground', color: 'primaryForeground' },
  secondary: { text: 'text-foreground', color: 'foreground' },
  ghost: { text: 'text-foreground', color: 'foreground' },
};

type ButtonProps = {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  children: ReactNode;
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  onPress,
  children,
}: ButtonProps) {
  const { text, color } = content[variant];
  const indicatorColor = useThemeColors()[color];
  return (
    <UIButton
      variant={variant}
      size={size}
      disabled={disabled || loading}
      onPress={disabled || loading ? undefined : onPress}
    >
      <View className="flex-row items-center gap-2">
        {loading ? (
          <ActivityIndicator size="small" color={indicatorColor} />
        ) : (
          icon && <Icon name={icon} color={color} size={18} />
        )}
        <AppText weight="semibold" className={text}>{children}</AppText>
      </View>
    </UIButton>
  );
}
