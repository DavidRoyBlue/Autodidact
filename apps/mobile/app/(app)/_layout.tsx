import { Stack } from 'expo-router';
import { useThemeColors } from '@/lib/theme-colors';

// The tabs are one screen of this stack, so a course and its lessons open above
// them: full screen, with a back button, and no tab bar over the chat composer.
export default function AppLayout() {
  const theme = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.foreground,
        headerShadowVisible: false,
        headerTitle: '',
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
