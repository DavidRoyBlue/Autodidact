import { useState } from 'react';
import { Alert } from 'react-native';
import { YStack } from 'tamagui';
import { useAuthStore } from '@/stores/auth.store';
import { supabase } from '@/lib/supabase';
import { Card, AppText, Input, Button } from '@/components';

export function UpgradeAccountCard() {
  const isAnonymous = useAuthStore((s) => s.isAnonymous);
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isAnonymous) return null;

  const handleUpgrade = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.updateUser({ email, password });
    setLoading(false);
    if (error) {
      Alert.alert('Could not save your account', error.message);
      return;
    }
    // Reconcile from the SERVER-returned user, never optimistically. With email
    // confirmation ON (prod) the user stays anonymous until they confirm; with it
    // OFF (local) the upgrade is immediate. Same UUID either way; the
    // sync_user_from_auth trigger updates public.users when the email lands.
    const stillAnonymous = data.user?.is_anonymous ?? false;
    const pendingEmail = (data.user as { new_email?: string } | undefined)?.new_email;
    if (accessToken && refreshToken) setSession(accessToken, refreshToken, stillAnonymous);
    if (stillAnonymous || pendingEmail) {
      Alert.alert(
        'Confirm your email',
        `We sent a confirmation link to ${pendingEmail ?? email}. Confirm it to finish linking your account and keep your progress.`,
      );
    } else {
      Alert.alert('Account saved', 'Your progress is now linked to your email.');
    }
  };

  return (
    <Card variant="elevated">
      <AppText variant="label">Save your progress</AppText>
      <AppText variant="muted">You're browsing as a guest. Add an email to keep your progress.</AppText>
      <YStack marginTop="$3" gap="$3">
        <Input
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Input
          label="Password"
          placeholder="Choose a password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <Button variant="primary" size="lg" loading={loading} onPress={handleUpgrade}>
          Save your account
        </Button>
      </YStack>
    </Card>
  );
}
