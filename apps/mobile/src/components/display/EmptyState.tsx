import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { AppText } from '../typography/AppText';
import { Button } from '../interactive/Button';
import { getThemeColors } from '@/lib/theme-colors';

type EmptyStateProps = {
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  action?: { label: string; onPress: () => void };
};

export function EmptyState({ message, icon, action }: EmptyStateProps) {
  const { colorScheme } = useColorScheme();
  const mutedColor = getThemeColors(colorScheme).mutedForeground;

  return (
    <View className="flex-1 items-center justify-center gap-4 pt-10">
      {icon && <Ionicons name={icon} size={48} color={mutedColor} />}
      <AppText variant="muted" className="text-center">
        {message}
      </AppText>
      {action && (
        <Button variant="ghost" size="sm" onPress={action.onPress}>
          {action.label}
        </Button>
      )}
    </View>
  );
}
