import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button as UIButton, buttonTextVariants } from '@/components/ui/button';
import { AppText } from '../typography/AppText';
import { Icon, type IconName } from '../display/Icon';
import { useThemeColors, type ThemeColor } from '@/lib/theme-colors';

type Variant = 'primary' | 'secondary' | 'ghost' | 'link';

// The icon and spinner take the label's color as a value.
const iconColor: Record<Variant, ThemeColor> = {
  primary: 'primaryForeground',
  secondary: 'foreground',
  ghost: 'foreground',
  link: 'primary',
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
  const spinnerColor = useThemeColors()[iconColor[variant]];
  return (
    <UIButton
      variant={variant}
      size={size}
      disabled={disabled || loading}
      onPress={disabled || loading ? undefined : onPress}
    >
      <View className="flex-row items-center gap-2">
        {loading ? (
          <ActivityIndicator size="small" color={spinnerColor} />
        ) : (
          icon && <Icon name={icon} color={iconColor[variant]} size={18} />
        )}
        <AppText className={buttonTextVariants({ variant, size })}>{children}</AppText>
      </View>
    </UIButton>
  );
}
