import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ThemeColor } from '@/lib/theme-colors';

export type IconName = keyof typeof Ionicons.glyphMap;

type IconProps = { name: IconName; color?: ThemeColor; size?: number };

/** An Ionicon colored by design token, never by hex. */
export function Icon({ name, color = 'foreground', size = 20 }: IconProps) {
  return <Ionicons name={name} size={size} color={useThemeColors()[color]} />;
}
