import { Stack } from 'expo-router';
import { useColorScheme } from 'nativewind';
import { getThemeColors } from '@/lib/theme-colors';

// A stack inside the My Courses tab, so course → module chat → back pops to
// the course (and the header carries a back button) instead of landing on
// the Learn tab.
export default function CoursesLayout() {
  const { colorScheme } = useColorScheme();
  const theme = getThemeColors(colorScheme);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.foreground,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'My Courses' }} />
      <Stack.Screen name="[id]/index" options={{ title: 'Course' }} />
      <Stack.Screen name="[id]/modules/[moduleId]/chat" options={{ title: 'Module' }} />
    </Stack>
  );
}
