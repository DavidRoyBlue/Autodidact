import { YStack } from 'tamagui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';
import { useUserCourses } from '@/api/courses';
import { Screen, Card, AppText, Button, UpgradeAccountCard } from '@/components';

export default function ProfileScreen() {
  const { user, clearSession } = useAuthStore();
  const { data: courses, isLoading: coursesLoading } = useUserCourses();

  const enrolled = courses?.length ?? 0;
  const completed = courses?.filter((c: { completedAt: string | null }) => c.completedAt).length ?? 0;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    clearSession();
  };

  return (
    <Screen>
      <YStack gap="$4" paddingTop="$4">
        <UpgradeAccountCard />

        <Card variant="default">
          <AppText variant="label">Progress</AppText>
          <YStack marginTop="$2" gap="$1">
            {coursesLoading ? (
              <AppText variant="muted">Loading...</AppText>
            ) : (
              <>
                <AppText variant="body">{enrolled} {enrolled === 1 ? 'course' : 'courses'} enrolled</AppText>
                <AppText variant="body" color="$success">{completed} completed</AppText>
              </>
            )}
          </YStack>
        </Card>

        <Card variant="elevated">
          <AppText variant="label">Email</AppText>
          <YStack marginTop="$1">
            <AppText variant="body" size="lg">{user?.email ?? '—'}</AppText>
          </YStack>
        </Card>

        <Button variant="danger" size="lg" onPress={handleSignOut}>
          Sign Out
        </Button>
      </YStack>
    </Screen>
  );
}
