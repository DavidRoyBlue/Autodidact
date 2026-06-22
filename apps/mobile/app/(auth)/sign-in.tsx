import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { supabase } from '@/lib/supabase';
import { signInWithGoogle, signInWithFacebook } from '@/lib/social-auth';
import { Screen, Heading, AppText, Input, Button } from '@/components';

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
    <Screen>
      <View className="flex-1 justify-center gap-4">
        <View className="gap-2 mb-6">
          <Heading size="h1">Autodidact</Heading>
          <AppText variant="muted" size="lg">Learn anything, one module at a time.</AppText>
        </View>

        <Button variant="primary" size="lg" loading={googleLoading}
          onPress={() => runSocial(signInWithGoogle, setGoogleLoading, 'Google sign-in failed')}>
          Continue with Google
        </Button>
        <Button variant="primary" size="lg" loading={facebookLoading}
          onPress={() => runSocial(signInWithFacebook, setFacebookLoading, 'Facebook sign-in failed')}>
          Continue with Facebook
        </Button>

        {showEmail ? (
          <View className="gap-3">
            <Input label="Email" placeholder="you@example.com" value={email}
              onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <Input label="Password" placeholder="Password" value={password}
              onChangeText={setPassword} secureTextEntry />
            <Button variant="primary" size="lg" loading={loading} onPress={handleSignIn}>
              Sign In
            </Button>
            <Button variant="ghost" size="sm" onPress={() => router.push('/(auth)/sign-up')}>
              Don't have an account? Sign up
            </Button>
          </View>
        ) : (
          <Button variant="ghost" size="sm" onPress={() => setShowEmail(true)}>
            Use email instead
          </Button>
        )}

        <Button variant="ghost" size="sm" loading={guestLoading} onPress={handleGuest}>
          Continue as guest
        </Button>
      </View>
    </Screen>
  );
}
