import { Alert, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';
import { useUserCourses } from '@/api/courses';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { Screen, Card, Heading, AppText, Badge, Button, Icon, UpgradeAccountCard } from '@/components';

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <View className="flex-1">
      <Card>
        <Heading size="h2">{value}</Heading>
        <AppText variant="caption">{label}</AppText>
      </Card>
    </View>
  );
}

export default function ProfileScreen() {
  const email = useAuthStore((s) => s.email);
  const isAnonymous = useAuthStore((s) => s.isAnonymous);
  const clearSession = useAuthStore((s) => s.clearSession);
  const { data: courses, refetch } = useUserCourses();
  useRefreshOnFocus(refetch);

  const count = (n?: number) => (courses ? n ?? 0 : '–');
  const modulesDone = courses?.reduce((sum, c) => sum + c.completedModules, 0);
  const coursesDone = courses?.filter((c) => c.completedAt).length;

  const signOut = async () => {
    await supabase.auth.signOut();
    clearSession();
  };
  const confirmSignOut = () =>
    isAnonymous
      ? Alert.alert('Sign out of the guest account?', 'Guest progress is lost when you sign out. Save your account first to keep it.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
        ])
      : void signOut();

  return (
    <Screen scroll>
      <View className="gap-6 pt-2">
        <Heading>Profile</Heading>

        <View className="flex-row items-center gap-4">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-primary/15">
            <Icon name="person" color="primary" size={26} />
          </View>
          <View className="flex-1 gap-1">
            <AppText weight="semibold" size="lg" numberOfLines={1}>
              {isAnonymous ? 'Guest learner' : email ?? 'Signed in'}
            </AppText>
            {isAnonymous && <Badge label="Guest" variant="warning" />}
          </View>
        </View>

        <View className="flex-row gap-3">
          <Stat value={count(courses?.length)} label="Courses" />
          <Stat value={count(modulesDone)} label="Modules" />
          <Stat value={count(coursesDone)} label="Finished" />
        </View>

        <UpgradeAccountCard />

        <Button variant="secondary" icon="log-out-outline" onPress={confirmSignOut}>
          Sign out
        </Button>
      </View>
    </Screen>
  );
}
