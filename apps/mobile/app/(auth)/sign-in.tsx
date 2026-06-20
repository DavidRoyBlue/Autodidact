import { useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { YStack } from 'tamagui';
import { useAuthStore } from '@/stores/auth.store';
import { supabase } from '@/lib/supabase';
import { Screen, Heading, AppText, Input, Button } from '@/components';

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const setSession = useAuthStore((s) => s.setSession);

  const handleSignIn = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      Alert.alert('Sign in failed', error.message);
      return;
    }
    if (data.session?.access_token && data.session?.refresh_token) {
      setSession(data.session.access_token, data.session.refresh_token);
    }
  };

  const handleGuest = async () => {
    setGuestLoading(true);
    const { data, error } = await supabase.auth.signInAnonymously();
    setGuestLoading(false);
    if (error) {
      Alert.alert('Could not continue as guest', error.message);
      return;
    }
    if (data.session?.access_token && data.session?.refresh_token) {
      setSession(data.session.access_token, data.session.refresh_token, data.session.user?.is_anonymous ?? true);
    }
  };

  return (
    <Screen>
      <YStack flex={1} justifyContent="center" gap="$4">
        <YStack gap="$2" marginBottom="$6">
          <Heading size="h1">Autodidact</Heading>
          <AppText variant="muted" size="lg">Learn anything, one module at a time.</AppText>
        </YStack>

        <YStack gap="$3">
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
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </YStack>

        <Button
          variant="primary"
          size="lg"
          loading={loading}
          onPress={handleSignIn}
        >
          Sign In
        </Button>

        <Button variant="ghost" size="sm" onPress={() => router.push('/(auth)/sign-up')}>
          Don't have an account? Sign up
        </Button>

        <Button variant="ghost" size="sm" loading={guestLoading} onPress={handleGuest}>
          Continue as guest
        </Button>
      </YStack>
    </Screen>
  );
}
