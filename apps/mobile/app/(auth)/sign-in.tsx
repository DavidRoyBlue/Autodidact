import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { supabase } from '@/lib/supabase';
import { signInWithGoogle, signInWithFacebook } from '@/lib/social-auth';
import { Screen, Heading, AppText, Input, Button, Icon } from '@/components';

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [facebookLoading, setFacebookLoading] = useState(false);
  const setSession = useAuthStore((s) => s.setSession);

  const runSocial = async (
    fn: () => Promise<{ accessToken: string; refreshToken: string } | null>,
    setBusy: (b: boolean) => void,
    failTitle: string,
  ) => {
    setBusy(true);
    try {
      const session = await fn();
      if (session) setSession(session.accessToken, session.refreshToken, false);
    } catch (e) {
      Alert.alert(failTitle, e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

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
    <Screen scroll>
      <View className="flex-1 justify-center gap-3 py-6">
        <View className="mb-6 items-center gap-3">
          <View className="h-16 w-16 items-center justify-center rounded-lg bg-primary">
            <Icon name="school" color="primaryForeground" size={32} />
          </View>
          <Heading className="text-center">Autodidact</Heading>
          <AppText variant="muted" size="lg" className="text-center">
            Name any topic. Get a course and a teacher who walks you through it.
          </AppText>
        </View>

        <Button size="lg" icon="logo-google" loading={googleLoading}
          onPress={() => runSocial(signInWithGoogle, setGoogleLoading, 'Google sign-in failed')}>
          Continue with Google
        </Button>
        <Button variant="secondary" size="lg" icon="logo-facebook" loading={facebookLoading}
          onPress={() => runSocial(signInWithFacebook, setFacebookLoading, 'Facebook sign-in failed')}>
          Continue with Facebook
        </Button>

        {showEmail ? (
          <View className="mt-3 gap-3">
            <Input label="Email" placeholder="you@example.com" value={email}
              onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <Input label="Password" placeholder="Password" value={password}
              onChangeText={setPassword} secureTextEntry autoComplete="password" />
            <Button size="lg" loading={loading} disabled={!email.trim() || !password} onPress={handleSignIn}>
              Sign In
            </Button>
            <Button variant="link" size="sm" onPress={() => router.push('/(auth)/sign-up')}>
              New here? Create an account
            </Button>
          </View>
        ) : (
          <Button variant="ghost" size="lg" icon="mail-outline" onPress={() => setShowEmail(true)}>
            Use email instead
          </Button>
        )}

        <View className="mt-4">
          <Button variant="link" size="sm" loading={guestLoading} onPress={handleGuest}>
            Continue as guest
          </Button>
          <AppText variant="caption" className="text-center">Try it first. Save your progress later.</AppText>
        </View>
      </View>
    </Screen>
  );
}
