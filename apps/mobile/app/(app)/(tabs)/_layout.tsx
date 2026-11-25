import { Tabs } from 'expo-router';
import { Icon, type IconName } from '@/components';
import { useThemeColors } from '@/lib/theme-colors';

const tab = (title: string, icon: IconName) => ({
  title,
  tabBarIcon: ({ focused }: { focused: boolean }) => (
    <Icon name={icon} color={focused ? 'primary' : 'mutedForeground'} size={24} />
  ),
});

export default function TabsLayout() {
  const theme = useThemeColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.mutedForeground,
      }}
    >
      <Tabs.Screen name="index" options={tab('Home', 'home-outline')} />
      <Tabs.Screen name="create" options={tab('New course', 'add-circle-outline')} />
      <Tabs.Screen name="profile" options={tab('Profile', 'person-outline')} />
    </Tabs>
  );
}
